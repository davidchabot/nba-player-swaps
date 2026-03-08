import { supabase } from "@/integrations/supabase/client";

interface FunctionErrorPayload {
  error?: string;
  message?: string;
  details?: string;
}

async function invokeFunction<TResponse>(
  functionName: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    throw new Error(error.message || `Failed to call ${functionName}`);
  }

  if (!data) {
    throw new Error(`No response from ${functionName}`);
  }

  const maybeError = data as FunctionErrorPayload;
  const functionMessage = maybeError?.error || maybeError?.message;
  if (typeof functionMessage === "string") {
    const details = typeof maybeError?.details === "string" ? ` (${maybeError.details})` : "";
    throw new Error(`${functionMessage}${details}`);
  }

  return data as TResponse;
}

// ========== AVATAR ==========

export async function uploadAvatarImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

export async function createAvatar(
  imageUrl: string,
  name: string
): Promise<{
  avatar_id: string;
  avatar_image_url?: string;
  provider?: "kling" | "lovable-ai" | "source";
  warning?: string | null;
  kling_task_id?: string | null;
}> {
  return invokeFunction("create-avatar", {
    image_url: imageUrl,
    name,
  });
}

export async function getAvatarStatus(avatarId: string) {
  return invokeFunction<{ avatar: unknown }>("check-job-status", {
    job_type: "avatar",
    job_id: avatarId,
  });
}

// ========== VIDEO ==========

export async function uploadVideo(file: File): Promise<{ videoId: string; videoUrl: string }> {
  const ext = file.name.split(".").pop() || "mp4";
  const storagePath = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from("videos").upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadErr) {
    throw new Error(`Video upload failed: ${uploadErr.message}`);
  }

  const { data: urlData } = supabase.storage.from("videos").getPublicUrl(storagePath);
  const videoUrl = urlData.publicUrl;

  const { data: videoRecord, error: dbErr } = await supabase
    .from("videos")
    .insert({
      filename: file.name,
      storage_path: storagePath,
      url: videoUrl,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (dbErr) {
    throw new Error(`DB insert failed: ${dbErr.message}`);
  }

  return { videoId: videoRecord.id, videoUrl };
}

export async function analyzeVideo(videoId: string, videoUrl: string): Promise<{ job_id: string }> {
  return invokeFunction("analyze-video", {
    video_id: videoId,
    video_url: videoUrl,
  });
}

export async function getAnalysisStatus(jobId: string) {
  return invokeFunction<{ job: any; tracks: any[] }>("check-job-status", {
    job_type: "analysis",
    job_id: jobId,
  });
}

// ========== REPLACEMENT ==========

export async function startReplacement(params: {
  video_id: string;
  avatar_id: string;
  track_id: string;
  video_url: string;
  avatar_image_url: string;
}): Promise<{ job_id: string }> {
  return invokeFunction("replace-player", params);
}

export async function getReplacementStatus(jobId: string) {
  return invokeFunction<{ job: any }>("check-job-status", {
    job_type: "replacement",
    job_id: jobId,
  });
}

// ========== REALTIME SUBSCRIPTIONS ==========

export function subscribeToAnalysisJob(jobId: string, onUpdate: (job: any) => void) {
  const channel = supabase
    .channel(`analysis-${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "analysis_jobs",
        filter: `id=eq.${jobId}`,
      },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToReplacementJob(jobId: string, onUpdate: (job: any) => void) {
  const channel = supabase
    .channel(`replacement-${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "replacement_jobs",
        filter: `id=eq.${jobId}`,
      },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
