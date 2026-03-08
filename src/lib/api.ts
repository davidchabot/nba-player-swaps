import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// ========== AVATAR ==========

export async function uploadAvatarImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

export async function createAvatar(imageUrl: string, name: string): Promise<{ avatar_id: string; kling_task_id?: string }> {
  const res = await fetch(`${FUNCTIONS_BASE}/create-avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to create avatar");
  }
  return res.json();
}

export async function getAvatarStatus(avatarId: string) {
  const res = await fetch(`${FUNCTIONS_BASE}/check-job-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_type: "avatar", job_id: avatarId }),
  });
  if (!res.ok) throw new Error("Failed to check avatar status");
  return res.json();
}

// ========== VIDEO ==========

export async function uploadVideo(file: File): Promise<{ videoId: string; videoUrl: string }> {
  const ext = file.name.split(".").pop() || "mp4";
  const storagePath = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from("videos").upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) throw new Error(`Video upload failed: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage.from("videos").getPublicUrl(storagePath);
  const videoUrl = urlData.publicUrl;

  // Create video record in DB
  const { data: videoRecord, error: dbErr } = await supabase
    .from("videos")
    .insert({
      filename: file.name,
      storage_path: storagePath,
      url: videoUrl,
      status: "uploaded",
    } as any)
    .select("id")
    .single();
  if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);

  return { videoId: (videoRecord as any).id, videoUrl };
}

export async function analyzeVideo(videoId: string, videoUrl: string): Promise<{ job_id: string }> {
  const res = await fetch(`${FUNCTIONS_BASE}/analyze-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_id: videoId, video_url: videoUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to start analysis");
  }
  return res.json();
}

export async function getAnalysisStatus(jobId: string) {
  const res = await fetch(`${FUNCTIONS_BASE}/check-job-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_type: "analysis", job_id: jobId }),
  });
  if (!res.ok) throw new Error("Failed to check analysis status");
  return res.json();
}

// ========== REPLACEMENT ==========

export async function startReplacement(params: {
  video_id: string;
  avatar_id: string;
  track_id: string;
  video_url: string;
  avatar_image_url: string;
}): Promise<{ job_id: string }> {
  const res = await fetch(`${FUNCTIONS_BASE}/replace-player`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to start replacement");
  }
  return res.json();
}

export async function getReplacementStatus(jobId: string) {
  const res = await fetch(`${FUNCTIONS_BASE}/check-job-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_type: "replacement", job_id: jobId }),
  });
  if (!res.ok) throw new Error("Failed to check replacement status");
  return res.json();
}

// ========== REALTIME SUBSCRIPTIONS ==========

export function subscribeToAnalysisJob(
  jobId: string,
  onUpdate: (job: any) => void
) {
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

export function subscribeToReplacementJob(
  jobId: string,
  onUpdate: (job: any) => void
) {
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
