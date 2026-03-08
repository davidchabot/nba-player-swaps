import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KLING_GENERATIONS_URL = "https://api.klingai.com/v1/images/generations";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type AvatarProvider = "kling" | "lovable-ai" | "source";

interface GenerationResult {
  imageUrl: string;
  provider: AvatarProvider;
  klingTaskId: string | null;
  warning: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let avatarId: string | null = null;

  try {
    const { image_url, name } = await req.json();
    if (!image_url) throw new Error("image_url is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: avatar, error: insertErr } = await supabase
      .from("avatars")
      .insert({
        name: name || "My Avatar",
        source_image_url: image_url,
        thumbnail_url: image_url,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    avatarId = avatar.id;

    const result = await generateBestAvatar({
      baseImageUrl: image_url,
      displayName: name || "My Avatar",
      avatarId,
      supabase,
    });

    const { error: updateErr } = await supabase
      .from("avatars")
      .update({
        source_image_url: result.imageUrl,
        thumbnail_url: result.imageUrl,
        kling_task_id: result.klingTaskId,
        status: "completed",
        error_message: result.warning,
        updated_at: new Date().toISOString(),
      })
      .eq("id", avatarId);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        success: true,
        avatar_id: avatarId,
        avatar_image_url: result.imageUrl,
        provider: result.provider,
        warning: result.warning,
        kling_task_id: result.klingTaskId,
        status: "completed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("create-avatar error:", error);

    if (avatarId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        await supabase
          .from("avatars")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", avatarId);
      } catch (innerError) {
        console.error("failed to mark avatar as failed:", innerError);
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateBestAvatar({
  baseImageUrl,
  displayName,
  avatarId,
  supabase,
}: {
  baseImageUrl: string;
  displayName: string;
  avatarId: string;
  supabase: ReturnType<typeof createClient>;
}): Promise<GenerationResult> {
  let klingError: string | null = null;

  try {
    const klingResult = await tryKlingGeneration(baseImageUrl, displayName);
    if (klingResult?.imageUrl) {
      return {
        imageUrl: klingResult.imageUrl,
        provider: "kling",
        klingTaskId: klingResult.taskId,
        warning: null,
      };
    }
  } catch (error) {
    klingError = error instanceof Error ? error.message : "Kling generation failed";
    console.error("kling generation failed:", klingError);
  }

  try {
    const lovableImage = await generateAvatarWithLovableAI(baseImageUrl, displayName);
    const uploadedUrl = await persistGeneratedImage({
      supabase,
      avatarId,
      imageDataUrlOrUrl: lovableImage,
    });

    return {
      imageUrl: uploadedUrl,
      provider: "lovable-ai",
      klingTaskId: null,
      warning: klingError,
    };
  } catch (error) {
    const fallbackError = error instanceof Error ? error.message : "Lovable AI avatar fallback failed";
    console.error("lovable ai fallback failed:", fallbackError);

    return {
      imageUrl: baseImageUrl,
      provider: "source",
      klingTaskId: null,
      warning: [klingError, fallbackError].filter(Boolean).join(" | ") || "Avatar generation fallback used",
    };
  }
}

async function tryKlingGeneration(baseImageUrl: string, displayName: string): Promise<{ imageUrl: string | null; taskId: string | null } | null> {
  const accessKey = Deno.env.get("KLING_ACCESS_KEY");
  const secretKey = Deno.env.get("KLING_SECRET_KEY");

  if (!accessKey || !secretKey) {
    throw new Error("KLING_ACCESS_KEY or KLING_SECRET_KEY missing");
  }

  const token = await createKlingJWT(accessKey, secretKey);

  const createRes = await fetch(KLING_GENERATIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: "kling-v1",
      prompt:
        `Create a high-fidelity 3D avatar portrait of ${displayName}. Keep the exact face identity, skin tone, hairstyle, and proportions from the input image. Neutral expression, cinematic soft studio lighting, clean background, centered head-and-shoulders framing.`,
      image: baseImageUrl,
      n: 1,
      aspect_ratio: "1:1",
    }),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Kling create failed (${createRes.status}): ${errorText}`);
  }

  const createData = await createRes.json();
  const taskId =
    createData?.data?.task_id ??
    createData?.data?.id ??
    createData?.task_id ??
    createData?.id ??
    null;

  if (!taskId) {
    const directOutput = extractKlingImageUrl(createData);
    return { imageUrl: directOutput, taskId: null };
  }

  const imageUrl = await pollKlingTask(token, taskId, 20, 2500);
  return { imageUrl, taskId };
}

async function pollKlingTask(token: string, taskId: string, maxAttempts: number, intervalMs: number): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await delay(intervalMs);

    const statusRes = await fetch(`${KLING_GENERATIONS_URL}/${taskId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!statusRes.ok) {
      const t = await statusRes.text();
      if (statusRes.status >= 500) {
        continue;
      }
      throw new Error(`Kling status failed (${statusRes.status}): ${t}`);
    }

    const statusData = await statusRes.json();
    const statusRaw =
      statusData?.data?.task_status ??
      statusData?.data?.status ??
      statusData?.task_status ??
      statusData?.status ??
      "";

    const status = String(statusRaw).toLowerCase();

    if (["succeed", "succeeded", "success", "completed", "done"].includes(status)) {
      return extractKlingImageUrl(statusData);
    }

    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      const reason = statusData?.data?.task_status_msg ?? statusData?.error ?? "Unknown Kling task failure";
      throw new Error(`Kling task failed: ${reason}`);
    }
  }

  return null;
}

function extractKlingImageUrl(payload: any): string | null {
  const candidates: unknown[] = [
    payload?.data?.task_result?.images?.[0]?.url,
    payload?.data?.task_result?.images?.[0],
    payload?.data?.images?.[0]?.url,
    payload?.data?.images?.[0],
    payload?.images?.[0]?.url,
    payload?.images?.[0],
    payload?.data?.result?.url,
    payload?.data?.output?.url,
    payload?.output?.[0],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }

  return null;
}

async function generateAvatarWithLovableAI(baseImageUrl: string, displayName: string): Promise<string> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const aiRes = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Transform this person into a realistic 3D avatar while preserving exact identity and facial features for ${displayName}. Keep skin tone, eye shape, nose, lips, hairstyle, and face geometry recognizable. Front-facing, shoulders visible, plain background, no text or logos.`,
            },
            {
              type: "image_url",
              image_url: {
                url: baseImageUrl,
              },
            },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!aiRes.ok) {
    const errorText = await aiRes.text();
    throw new Error(`Lovable AI request failed (${aiRes.status}): ${errorText}`);
  }

  const aiData = await aiRes.json();
  const imageUrl = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;

  if (!imageUrl) {
    throw new Error("Lovable AI returned no image");
  }

  return imageUrl;
}

async function persistGeneratedImage({
  supabase,
  avatarId,
  imageDataUrlOrUrl,
}: {
  supabase: ReturnType<typeof createClient>;
  avatarId: string;
  imageDataUrlOrUrl: string;
}): Promise<string> {
  if (imageDataUrlOrUrl.startsWith("http")) {
    return imageDataUrlOrUrl;
  }

  if (!imageDataUrlOrUrl.startsWith("data:image/")) {
    throw new Error("Unsupported image format from AI provider");
  }

  const { bytes, contentType, ext } = decodeDataUrl(imageDataUrlOrUrl);
  const path = `generated/${avatarId}_${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, {
      contentType,
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Failed to store generated avatar: ${uploadErr.message}`);
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string; ext: string } {
  const [meta, b64] = dataUrl.split(",");
  if (!meta || !b64) {
    throw new Error("Invalid data URL");
  }

  const contentType = meta.match(/data:([^;]+)/)?.[1] || "image/png";
  const ext = contentType.split("/")[1] || "png";

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { bytes, contentType, ext };
}

async function createKlingJWT(accessKey: string, secretKey: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5, iat: now }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`));
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${payload}.${b64sig}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
