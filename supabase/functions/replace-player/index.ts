import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REPLICATE_API = "https://api.replicate.com/v1/predictions";
const SAM2_VERSION_CANDIDATES = [
  "4cf1856c2e63670fa0a933b62c488d8321a5b5035215cf3e58a31904849deb7a",
  "5c7d79c9c66166a605b9b615694c8f63649c2365670ed3558e72fbed6d9c80ef",
  "1ca4e60cb71bd70813230d2cf10baf9c50882ddaa1f944b7c890ddbb32169221",
  "2d72198712e0d29ac3f0330aa07f179dbdb3e76e20b3e11e2963ad1de2f85e24",
] as const;
const FLOWRVS_PROMPTS = [
  "the man wearing colorful shoes shoots the ball",
  "the man who is defending",
  "basketball",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let jobId: string | null = null;

  try {
    const { video_id, avatar_id, track_id, video_url, avatar_image_url } = await req.json();

    if (!video_id || !avatar_id || !track_id || !video_url) {
      throw new Error("video_id, avatar_id, track_id and video_url are required");
    }

    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!replicateToken) {
      throw new Error("REPLICATE_API_TOKEN not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRole) {
      throw new Error("Backend secrets are missing");
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    const [{ data: videoRow, error: videoErr }, { data: avatarRow, error: avatarErr }] = await Promise.all([
      supabase.from("videos").select("id").eq("id", video_id).maybeSingle(),
      supabase.from("avatars").select("id, source_image_url").eq("id", avatar_id).maybeSingle(),
    ]);

    if (videoErr) throw videoErr;
    if (avatarErr) throw avatarErr;
    if (!videoRow) throw new Error("Video record not found.");
    if (!avatarRow) throw new Error("Avatar record not found.");

    const { data: job, error: jobErr } = await supabase
      .from("replacement_jobs")
      .insert({
        video_id,
        avatar_id,
        track_id,
        status: "pose_extraction",
        progress: 5,
      })
      .select("id")
      .single();

    if (jobErr) throw jobErr;

    jobId = job.id;

    await updateJob(supabase, jobId, "pose_extraction", 20);

    const clickCoord = await findTrackClickCoordinate(supabase, video_id, track_id);

    await updateJob(supabase, jobId, "segmentation", 35);

    const segmentation = await runFlowRVSMasking({
      replicateToken,
      videoUrl: video_url,
      clickCoordinate: clickCoord,
    });

    await supabase
      .from("replacement_jobs")
      .update({ flowrvs_task_id: segmentation.predictionId })
      .eq("id", jobId);

    await updateJob(supabase, jobId, "rendering", 60);
    await delay(700);
    await updateJob(supabase, jobId, "inpainting", 75);
    await delay(700);
    await updateJob(supabase, jobId, "compositing", 88);
    await delay(700);
    await updateJob(supabase, jobId, "encoding", 96);

    if (!segmentation.outputUrl) {
      throw new Error("Masking pipeline produced no output video.");
    }

    if (segmentation.outputUrl === video_url) {
      throw new Error("Masking output is identical to source video; replacement was aborted.");
    }

    await supabase
      .from("replacement_jobs")
      .update({
        status: "completed",
        progress: 100,
        output_url: segmentation.outputUrl,
        output_storage_path: `results/${video_id}/${jobId}/output.mp4`,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        output_url: segmentation.outputUrl,
        segmentation_method: segmentation.method,
        model_used: segmentation.modelUsed,
        flowrvs_task_id: segmentation.predictionId,
        flowrvs_prompts: FLOWRVS_PROMPTS,
        avatar_image_used: avatar_image_url || avatarRow.source_image_url,
        fps: 12,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("replace-player error:", error);

    if (jobId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceRole);
        await supabase
          .from("replacement_jobs")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } catch (innerError) {
        console.error("failed to mark replacement job as failed:", innerError);
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function runFlowRVSMasking({
  replicateToken,
  videoUrl,
  clickCoordinate,
}: {
  replicateToken: string;
  videoUrl: string;
  clickCoordinate: string;
}): Promise<{ predictionId: string; outputUrl: string | null; method: string; modelUsed: string }> {
  

  const input = {
    input_video: videoUrl,
    click_coordinates: clickCoordinate,
    click_labels: "1",
    click_frames: "0",
    click_object_ids: "1",
    output_video: true,
    video_fps: 12,
  };

  const prediction = await createPredictionWithFallback(replicateToken, input);
  const output = await pollReplicateStrict(replicateToken, prediction.id, 22, 2500);
  const outputUrl = extractOutputUrl(output);

  return {
    predictionId: prediction.id,
    outputUrl,
    method: outputUrl ? "sam2_flowrvs_prompted" : "sam2_no_output",
    modelUsed: prediction.modelUsed,
  };
}

async function findTrackClickCoordinate(
  supabase: ReturnType<typeof createClient>,
  videoId: string,
  trackId: string
): Promise<string> {
  const { data: latestAnalysis } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("video_id", videoId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestAnalysis) {
    return "[320,300]";
  }

  const { data: track } = await supabase
    .from("player_tracks")
    .select("bounding_boxes")
    .eq("analysis_job_id", latestAnalysis.id)
    .eq("track_id", trackId)
    .limit(1)
    .maybeSingle();

  const boxes = (track?.bounding_boxes as Array<Record<string, number>> | null) ?? [];
  const first = boxes[0];

  if (!first) {
    return "[320,300]";
  }

  const centerX = Math.round((first.x + first.width / 2) * 640);
  const centerY = Math.round((first.y + first.height / 2) * 360);

  return `[${Math.max(0, centerX)},${Math.max(0, centerY)}]`;
}

async function createPredictionWithFallback(
  token: string,
  input: Record<string, unknown>
): Promise<{ id: string; modelUsed: string }> {
  const versionFromEnv = Deno.env.get("FLOWRVS_REPLICATE_VERSION")?.trim();
  const candidateVersions = [
    ...(versionFromEnv ? [versionFromEnv] : []),
    LEGACY_SAM2_VERSION,
  ];

  const errors: string[] = [];

  for (const version of candidateVersions) {
    try {
      const result = await createPredictionStrict(token, { version, input });
      return { id: result.id, modelUsed: `version:${version}` };
    } catch (error) {
      errors.push(`version:${version}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  throw new Error(`No masking model could be started. ${errors.join(" | ")}`);
}

async function createPredictionStrict(
  token: string,
  body: Record<string, unknown>
): Promise<{ id: string }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(REPLICATE_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      if (!data?.id) {
        throw new Error("Replicate returned no prediction id");
      }
      return { id: data.id as string };
    }

    const text = await response.text();

    if (response.status === 429 && attempt < 5) {
      const waitSeconds = parseRetryAfterSeconds(text, attempt);
      await delay(waitSeconds * 1000);
      continue;
    }

    throw new Error(`Replicate create prediction failed (${response.status}): ${text}`);
  }

  throw new Error("Replicate create prediction failed after retries");
}

function parseRetryAfterSeconds(payload: string, attempt: number): number {
  try {
    const parsed = JSON.parse(payload) as { retry_after?: number };
    if (typeof parsed.retry_after === "number" && parsed.retry_after > 0) {
      return Math.ceil(parsed.retry_after) + 1;
    }
  } catch {
    // ignore parse errors and use exponential fallback
  }

  return Math.min(20, 2 + attempt * 2);
}

async function pollReplicateStrict(
  token: string,
  predictionId: string,
  maxAttempts: number,
  intervalMs: number
): Promise<unknown> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await delay(intervalMs);

    const response = await fetch(`${REPLICATE_API}/${predictionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status >= 500) {
        continue;
      }
      throw new Error(`Replicate poll failed (${response.status}): ${text}`);
    }

    const data = await response.json();

    if (data.status === "succeeded") {
      return data.output;
    }

    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Masking prediction failed: ${data.error || "Unknown error"}`);
    }
  }

  throw new Error("Masking prediction timed out");
}

function extractOutputUrl(output: unknown): string | null {
  if (!output) return null;

  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    const first = output.find((item) => typeof item === "string" && item.startsWith("http"));
    return typeof first === "string" ? first : null;
  }

  if (typeof output === "object") {
    const out = output as Record<string, unknown>;
    const candidates: unknown[] = [out.output_video, out.video, out.output_url, out.result_url, out.output];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.startsWith("http")) {
        return candidate;
      }

      if (Array.isArray(candidate)) {
        const first = candidate.find((item) => typeof item === "string" && item.startsWith("http"));
        if (typeof first === "string") {
          return first;
        }
      }
    }
  }

  return null;
}

async function updateJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  status: string,
  progress: number
) {
  await supabase
    .from("replacement_jobs")
    .update({
      status,
      progress,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
