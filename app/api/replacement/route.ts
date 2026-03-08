import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runReplacementPipeline, ReplacementProgress } from "@/lib/replacement";
import { Track } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoClipId, trackId, avatarId, options } = body;

    if (!videoClipId || !trackId || !avatarId) {
      return NextResponse.json(
        { error: "Missing required fields: videoClipId, trackId, avatarId" },
        { status: 400 }
      );
    }

    // Create replacement job record
    const { data: job, error: jobError } = await supabase
      .from("replacement_jobs")
      .insert({
        video_clip_id: videoClipId,
        track_id: trackId,
        avatar_id: avatarId,
        status: "pending",
        progress: 0,
        current_step: "pending",
        quality: options?.quality || "standard",
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create replacement job:", jobError);
      return NextResponse.json(
        { error: "Failed to create replacement job" },
        { status: 500 }
      );
    }

    // Start replacement in background
    processReplacementJob(job.id, videoClipId, trackId, avatarId, options?.quality || "standard");

    return NextResponse.json({
      jobId: job.id,
      status: "pending",
      message: "Replacement job started",
    });
  } catch (error) {
    console.error("Replacement API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function processReplacementJob(
  jobId: string,
  videoClipId: string,
  trackId: string,
  avatarId: string,
  quality: "draft" | "standard" | "high"
) {
  try {
    // Fetch video clip
    const { data: videoClip, error: clipError } = await supabase
      .from("video_clips")
      .select("*")
      .eq("id", videoClipId)
      .single();

    if (clipError || !videoClip) {
      throw new Error("Video clip not found");
    }

    // Fetch analysis result to get track data
    const { data: analysisJob, error: analysisError } = await supabase
      .from("analysis_jobs")
      .select("result")
      .eq("video_clip_id", videoClipId)
      .eq("status", "completed")
      .single();

    if (analysisError || !analysisJob?.result) {
      throw new Error("Analysis result not found");
    }

    // Find the track in the analysis result
    const trackData = analysisJob.result.tracks?.find((t: any) => t.trackId === trackId);

    if (!trackData) {
      throw new Error(`Track ${trackId} not found in analysis result`);
    }

    // Fetch avatar
    const { data: avatar, error: avatarError } = await supabase
      .from("avatars")
      .select("*")
      .eq("id", avatarId)
      .single();

    if (avatarError || !avatar) {
      throw new Error("Avatar not found");
    }

    // Get video URL
    const { data: videoUrlData } = await supabase.storage
      .from("video-clips")
      .createSignedUrl(videoClip.storage_path, 3600);

    if (!videoUrlData?.signedUrl) {
      throw new Error("Failed to get video URL");
    }

    // Get avatar model URL
    const avatarModelUrl = avatar.model_path
      ? (await supabase.storage.from("avatars").createSignedUrl(avatar.model_path, 3600))?.data?.signedUrl
      : avatar.source_image_url; // Fallback to source image if no 3D model

    if (!avatarModelUrl) {
      throw new Error("Failed to get avatar model URL");
    }

    // trackData is already in the correct Track format from analysis result
    const track: Track = trackData;

    // Run replacement pipeline with progress updates
    const result = await runReplacementPipeline({
      quality,
      avatarModelUrl,
      videoUrl: videoUrlData.signedUrl,
      track,
      fps: videoClip.fps || 30,
      onProgress: async (progress: ReplacementProgress) => {
        // Update job progress in database
        await supabase
          .from("replacement_jobs")
          .update({
            status: progress.step,
            progress: progress.progress,
            current_step: progress.step,
          })
          .eq("id", jobId);
      },
    });

    // Upload output video to storage
    const outputPath = `replacements/${jobId}/output.mp4`;

    // Fetch the output video and upload it
    const outputResponse = await fetch(result.outputVideoUrl);
    const outputBlob = await outputResponse.blob();
    const outputBuffer = Buffer.from(await outputBlob.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("video-clips")
      .upload(outputPath, outputBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      console.error("Failed to upload output video:", uploadError);
    }

    // Update job as completed
    await supabase
      .from("replacement_jobs")
      .update({
        status: "completed",
        progress: 100,
        current_step: "completed",
        output_storage_path: outputPath,
      })
      .eq("id", jobId);
  } catch (error) {
    console.error("Replacement job failed:", error);

    // Update job as failed
    await supabase
      .from("replacement_jobs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", jobId);
  }
}
