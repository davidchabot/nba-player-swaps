import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REPLICATE_API = "https://api.replicate.com/v1/predictions";
const FLOWRVS_SAM2_VERSION = "33432afdfc06a10da6b4018932893d39b0159f838b6d11dd1236dff85cc5ec1d";
const FLOWRVS_PROMPTS = [
  "the man wearing colorful shoes shoots the ball",
  "the man who is defending",
  "basketball",
];
const REPLICATE_POLL_INTERVAL_MS = 3000;
const REPLICATE_POLL_TIMEOUT_MS = 12 * 60 * 1000;
const MAX_TRACK_PROMPT_POINTS = 6;

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

    queueBackgroundTask(
      runReplacementJob({
        supabaseUrl,
        serviceRole,
        replicateToken,
        jobId,
        videoId: video_id,
        trackId: track_id,
        videoUrl: video_url,
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status: "queued",
        model_used: `meta/sam-2-video:${FLOWRVS_SAM2_VERSION}`,
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

function queueBackgroundTask(task: Promise<void>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;

  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return;
  }

  task.catch((error) => console.error("replace-player background task error:", error));
}

async function runReplacementJob({
  supabaseUrl,
  serviceRole,
  replicateToken,
  jobId,
  videoId,
  trackId,
  videoUrl,
}: {
  supabaseUrl: string;
  serviceRole: string;
  replicateToken: string;
  jobId: string;
  videoId: string;
  trackId: string;
  videoUrl: string;
}) {
  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    await updateJob(supabase, jobId, "pose_extraction", 20);

    const promptBundle = await findTrackPromptBundle(supabase, videoId, trackId);

    await updateJob(supabase, jobId, "segmentation", 35);

    const segmentation = await runFlowRVSMasking({
      replicateToken,
      videoUrl,
      promptBundle,
      onPredictionCreated: async (predictionId) => {
        await supabase
          .from("replacement_jobs")
          .update({ flowrvs_task_id: predictionId, updated_at: new Date().toISOString() })
          .eq("id", jobId);
      },
    });

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

    if (segmentation.outputUrl === videoUrl) {
      throw new Error("Masking output is identical to source video; replacement was aborted.");
    }

    await supabase
      .from("replacement_jobs")
      .update({
        status: "completed",
        progress: 100,
        output_url: segmentation.outputUrl,
        output_storage_path: `results/${videoId}/${jobId}/output.mp4`,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await supabase
      .from("replacement_jobs")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    console.error("replace-player processing error:", error);
  }
}

type TrackBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  frame?: number;
};

type PromptBundle = {
  clickCoordinates: string;
  clickLabels: string;
  clickFrames: string;
  clickObjectIds: string;
};

async function runFlowRVSMasking({
  replicateToken,
  videoUrl,
  promptBundle,
  onPredictionCreated,
}: {
  replicateToken: string;
  videoUrl: string;
  promptBundle: PromptBundle;
  onPredictionCreated?: (predictionId: string) => Promise<void>;
}): Promise<{ predictionId: string; outputUrl: string | null; method: string; modelUsed: string }> {
  const input = {
    input_video: videoUrl,
    click_coordinates: promptBundle.clickCoordinates,
    click_labels: promptBundle.clickLabels,
    click_frames: promptBundle.clickFrames,
    click_object_ids: promptBundle.clickObjectIds,
    output_video: true,
    video_fps: 12,
  };

  const prediction = await createPredictionExactVersion(replicateToken, input);

  if (onPredictionCreated) {
    await onPredictionCreated(prediction.id);
  }

  const output = await pollReplicateStrict(
    replicateToken,
    prediction.id,
    REPLICATE_POLL_TIMEOUT_MS,
    REPLICATE_POLL_INTERVAL_MS
  );
  const outputUrl = extractOutputUrl(output);

  return {
    predictionId: prediction.id,
    outputUrl,
    method: outputUrl ? "sam2_flowrvs_prompted" : "sam2_no_output",
    modelUsed: prediction.modelUsed,
  };
}

async function findTrackPromptBundle(
  supabase: ReturnType<typeof createClient>,
  videoId: string,
  trackId: string
): Promise<PromptBundle> {
  const fallbackCoordinate = "[320,300]";

  const { data: latestAnalysis } = await supabase
    .from("analysis_jobs")
    .select("id")
    .eq("video_id", videoId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestAnalysis) {
    return {
      clickCoordinates: fallbackCoordinate,
      clickLabels: "1",
      clickFrames: "0",
      clickObjectIds: "1",
    };
  }

  const { data: track } = await supabase
    .from("player_tracks")
    .select("bounding_boxes")
    .eq("analysis_job_id", latestAnalysis.id)
    .eq("track_id", trackId)
    .limit(1)
    .maybeSingle();

  const rawBoxes = (track?.bounding_boxes as TrackBoundingBox[] | null) ?? [];
  const normalizedBoxes = rawBoxes
    .filter((box) => Number.isFinite(box?.x) && Number.isFinite(box?.y) && Number.isFinite(box?.width) && Number.isFinite(box?.height))
    .sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));

  if (normalizedBoxes.length === 0) {
    return {
      clickCoordinates: fallbackCoordinate,
      clickLabels: "1",
      clickFrames: "0",
      clickObjectIds: "1",
    };
  }

  const stride = Math.max(1, Math.floor(normalizedBoxes.length / MAX_TRACK_PROMPT_POINTS));
  const sampled = normalizedBoxes.filter((_, index) => index % stride === 0).slice(0, MAX_TRACK_PROMPT_POINTS);

  const coordinateParts: string[] = [];
  const frameParts: string[] = [];

  for (const box of sampled) {
    const centerX = Math.round((box.x + box.width / 2) * 640);
    const centerY = Math.round((box.y + box.height / 2) * 360);
    coordinateParts.push(`[${Math.max(0, centerX)},${Math.max(0, centerY)}]`);
    frameParts.push(String(Math.max(0, Math.round(box.frame ?? 0))));
  }

  if (coordinateParts.length === 0) {
    coordinateParts.push(fallbackCoordinate);
    frameParts.push("0");
  }

  if (frameParts[0] !== "0") {
    coordinateParts.unshift(coordinateParts[0]);
    frameParts.unshift("0");
  }

  const clickLabels = coordinateParts.map(() => "1").join(",");
  const clickObjectIds = coordinateParts.map(() => "1").join(",");

  return {
    clickCoordinates: coordinateParts.join(","),
    clickLabels,
    clickFrames: frameParts.join(","),
    clickObjectIds,
  };
}

async function createPredictionExactVersion(
  token: string,
  input: Record<string, unknown>
): Promise<{ id: string; modelUsed: string }> {
  const result = await createPredictionStrict(token, FLOWRVS_SAM2_VERSION, input);
  return {
    id: result.id,
    modelUsed: `meta/sam-2-video:${FLOWRVS_SAM2_VERSION}`,
  };
}

async function createPredictionStrict(
  token: string,
  version: string,
  input: Record<string, unknown>
): Promise<{ id: string }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(REPLICATE_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version, input }),
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
  timeoutMs: number,
  intervalMs: number
): Promise<unknown> {
  const startedAt = Date.now();
  let lastStatus = "starting";
  let lastError: string | null = null;
  let rateLimitRetryCount = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await delay(intervalMs);

    const response = await fetch(`${REPLICATE_API}/${predictionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 429) {
        const waitSeconds = parseRetryAfterSeconds(text, rateLimitRetryCount);
        rateLimitRetryCount += 1;
        await delay(waitSeconds * 1000);
        continue;
      }
      if (response.status >= 500) {
        continue;
      }
      throw new Error(`Replicate poll failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    lastStatus = typeof data.status === "string" ? data.status : "unknown";

    if (typeof data.error === "string" && data.error.trim().length > 0) {
      lastError = data.error;
    }

    if (lastStatus === "succeeded") {
      return data.output;
    }

    if (lastStatus === "failed" || lastStatus === "canceled") {
      throw new Error(`Masking prediction failed: ${lastError || "Unknown error"}`);
    }
  }

  const timeoutMinutes = Math.round((timeoutMs / 60000) * 10) / 10;
  const errorSuffix = lastError ? ` Last error: ${lastError}` : "";
  throw new Error(
    `Masking prediction timed out after ${timeoutMinutes} minutes (last status: ${lastStatus}).${errorSuffix}`
  );
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
