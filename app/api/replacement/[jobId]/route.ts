import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    // Fetch job from database
    const { data: job, error } = await supabase
      .from("replacement_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Build response
    const response: {
      jobId: string;
      status: string;
      progress: number;
      currentStep: string;
      errorMessage?: string;
      outputUrl?: string;
      previewUrl?: string;
    } = {
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      currentStep: job.current_step || job.status,
    };

    // Include error message if failed
    if (job.status === "failed" && job.error_message) {
      response.errorMessage = job.error_message;
    }

    // Include output URL if completed
    if (job.status === "completed" && job.output_storage_path) {
      const { data: urlData } = await supabase.storage
        .from("video-clips")
        .createSignedUrl(job.output_storage_path, 3600);

      if (urlData?.signedUrl) {
        response.outputUrl = urlData.signedUrl;
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get replacement job error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Cancel a replacement job
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    // Update job status to cancelled
    const { error } = await supabase
      .from("replacement_jobs")
      .update({
        status: "cancelled",
        error_message: "Job cancelled by user",
      })
      .eq("id", jobId)
      .in("status", ["pending", "pose_extraction", "segmentation", "inpainting", "rendering", "compositing"]);

    if (error) {
      return NextResponse.json(
        { error: "Failed to cancel job" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Job cancelled" });
  } catch (error) {
    console.error("Cancel replacement job error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
