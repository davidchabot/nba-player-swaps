import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// KIE API endpoints
const KIE_BASE = "https://api.kie.ai";
const KIE_FLUX_KONTEXT = `${KIE_BASE}/api/v1/flux/kontext/generate`;
const KIE_CREATE_TASK = `${KIE_BASE}/api/v1/jobs/createTask`;
const KIE_TASK_STATUS = `${KIE_BASE}/api/v1/jobs/recordInfo`;
const KIE_FLUX_STATUS = `${KIE_BASE}/api/v1/flux/kontext/record-info`;

const KIE_POLL_INTERVAL_MS = 3000;
const KIE_POLL_MAX_ATTEMPTS = 120;

type AvatarProvider = "kie-flux-kontext" | "kie-kling-avatar" | "source";

interface GenerationResult {
  imageUrl: string;
  provider: AvatarProvider;
  kieTaskId: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let avatarId: string | null = null;

  try {
    const { image_url, name } = await req.json();
    if (!image_url) throw new Error("image_url is required");

    const kieApiKey = Deno.env.get("KIE_API_KEY");
    if (!kieApiKey) throw new Error("KIE_API_KEY is not configured. Please add your KIE API key.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRole);

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

    // Run generation in background to avoid HTTP timeout
    queueBackgroundTask(
      runAvatarGeneration({
        supabaseUrl,
        serviceRole,
        kieApiKey,
        avatarId,
        imageUrl: image_url,
        displayName: name || "My Avatar",
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        avatar_id: avatarId,
        status: "processing",
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

function queueBackgroundTask(task: Promise<void>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return;
  }
  task.catch((error) => console.error("create-avatar background task error:", error));
}

async function runAvatarGeneration({
  supabaseUrl,
  serviceRole,
  kieApiKey,
  avatarId,
  imageUrl,
  displayName,
}: {
  supabaseUrl: string;
  serviceRole: string;
  kieApiKey: string;
  avatarId: string;
  imageUrl: string;
  displayName: string;
}) {
  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    const result = await generateAvatarViaKIE({
      kieApiKey,
      baseImageUrl: imageUrl,
      displayName,
      avatarId,
      supabase,
    });

    await supabase
      .from("avatars")
      .update({
        source_image_url: result.imageUrl,
        thumbnail_url: result.imageUrl,
        kling_task_id: result.kieTaskId,
        status: "completed",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", avatarId);

    console.log(`Avatar ${avatarId} completed via ${result.provider}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Avatar ${avatarId} generation failed:`, message);
    await supabase
      .from("avatars")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", avatarId);
  }
}

async function generateAvatarViaKIE({
  kieApiKey,
  baseImageUrl,
  displayName,
  avatarId,
  supabase,
}: {
  kieApiKey: string;
  baseImageUrl: string;
  displayName: string;
  avatarId: string;
  supabase: ReturnType<typeof createClient>;
}): Promise<GenerationResult> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const fluxResult = await tryFluxKontextAvatar(kieApiKey, baseImageUrl, displayName);
      if (!fluxResult?.imageUrl) {
        throw new Error("Flux Kontext completed but returned no image URL");
      }

      const persistedUrl = await persistImageFromUrl({
        supabase,
        avatarId,
        sourceUrl: fluxResult.imageUrl,
      });

      return {
        imageUrl: persistedUrl,
        provider: "kie-flux-kontext",
        kieTaskId: fluxResult.taskId,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Flux Kontext generation failed";
      console.error(`flux kontext avatar failed (attempt ${attempt}/2):`, lastError);
      if (attempt < 2) {
        await delay(2000 * attempt);
      }
    }
  }

  throw new Error(lastError || "Avatar generation failed after retries");
}

// ========== Flux Kontext (Image-to-Image via KIE) ==========

async function tryFluxKontextAvatar(
  apiKey: string,
  imageUrl: string,
  displayName: string
): Promise<{ imageUrl: string; taskId: string } | null> {
  const prompt = `Transform this person's photo into a high-quality realistic 3D avatar portrait of ${displayName}. Preserve the exact facial identity, skin tone, eye shape, nose, lips, jawline, hairstyle, and face geometry. Render in clean 3D style with soft studio lighting, subtle depth and dimensionality. Head and shoulders framing, centered, clean neutral background. No text, no logos, no artifacts.`;

  console.log("Creating Flux Kontext avatar task via KIE...");

  const createRes = await fetch(KIE_FLUX_KONTEXT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      inputImage: imageUrl,
      aspectRatio: "1:1",
      outputFormat: "png",
      model: "flux-kontext-max",
      promptUpsampling: false,
      safetyTolerance: 6,
    }),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`KIE Flux Kontext create failed (${createRes.status}): ${errorText}`);
  }

  const createData = await createRes.json();
  console.log("KIE Flux Kontext create response:", JSON.stringify(createData));

  if (createData.code !== 200) {
    throw new Error(`KIE Flux Kontext error (code ${createData.code}): ${createData.msg || "Unknown"}`);
  }

  const taskId = createData.data?.taskId;
  if (!taskId) {
    throw new Error("KIE Flux Kontext returned no taskId");
  }

  console.log(`Flux Kontext task created: ${taskId}, polling...`);

  const imageResultUrl = await pollKieFluxTask(
    apiKey,
    taskId,
    KIE_POLL_MAX_ATTEMPTS,
    KIE_POLL_INTERVAL_MS
  );
  if (!imageResultUrl) {
    throw new Error("Flux Kontext task completed but returned no image URL");
  }

  return { imageUrl: imageResultUrl, taskId };
}

async function pollKieFluxTask(
  apiKey: string,
  taskId: string,
  maxAttempts: number,
  intervalMs: number
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await delay(intervalMs);

    // Use the Flux Kontext record-info endpoint
    const statusRes = await fetch(`${KIE_FLUX_STATUS}?taskId=${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!statusRes.ok) {
      if (statusRes.status >= 500) continue;
      const t = await statusRes.text();
      throw new Error(`KIE Flux status check failed (${statusRes.status}): ${t}`);
    }

    const statusData = await statusRes.json();
    console.log(`KIE flux poll attempt ${attempt + 1}:`, JSON.stringify(statusData));

    if (statusData.code !== 200) {
      // May be a transient error, keep polling
      continue;
    }

    const d = statusData.data;
    if (!d) continue;

    const flag = d.successFlag;

    // 0 = generating, keep polling
    if (flag === 0) continue;

    // 1 = success
    if (flag === 1) {
      const resultUrl = d.response?.resultImageUrl;
      if (typeof resultUrl === "string" && resultUrl.startsWith("http")) {
        return resultUrl;
      }
      // Also check originImageUrl as fallback
      const originUrl = d.response?.originImageUrl;
      if (typeof originUrl === "string" && originUrl.startsWith("http")) {
        return originUrl;
      }
      return null;
    }

    // 2 = create task failed, 3 = generate failed
    if (flag === 2 || flag === 3) {
      const errMsg = d.errorMessage || d.response?.errorMessage || "KIE generation failed";
      throw new Error(`KIE Flux Kontext failed (flag=${flag}): ${errMsg}`);
    }
  }

  throw new Error("KIE avatar task timed out after polling");
}

function extractKieResult(data: any): string | null | undefined {
  // Check for failure
  const state = data?.data?.state ?? data?.state ?? "";
  
  if (state === "fail" || state === "failed") {
    const failMsg = data?.data?.failMsg ?? data?.failMsg ?? "Unknown KIE task failure";
    throw new Error(`KIE task failed: ${failMsg}`);
  }

  if (state === "success" || state === "completed") {
    // resultJson is a JSON string: {"resultUrls":["https://..."]}
    const resultJsonStr = data?.data?.resultJson ?? data?.resultJson;
    if (typeof resultJsonStr === "string") {
      try {
        const parsed = JSON.parse(resultJsonStr);
        const urls = parsed?.resultUrls ?? parsed?.result_urls ?? [];
        if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") {
          return urls[0];
        }
      } catch {
        console.error("Failed to parse KIE resultJson:", resultJsonStr);
      }
    }

    // Also check direct URL fields
    const directUrl = data?.data?.url ?? data?.data?.imageUrl ?? data?.data?.image_url;
    if (typeof directUrl === "string" && directUrl.startsWith("http")) {
      return directUrl;
    }

    // Check for images array
    const images = data?.data?.images ?? data?.images;
    if (Array.isArray(images) && images.length > 0) {
      const first = images[0];
      if (typeof first === "string" && first.startsWith("http")) return first;
      if (typeof first?.url === "string") return first.url;
    }

    return null; // success but no URL found
  }

  // Still processing
  return undefined;
}

// ========== Image Persistence ==========

async function persistImageFromUrl({
  supabase,
  avatarId,
  sourceUrl,
}: {
  supabase: ReturnType<typeof createClient>;
  avatarId: string;
  sourceUrl: string;
}): Promise<string> {
  try {
    const imageRes = await fetch(sourceUrl);
    if (!imageRes.ok) {
      console.error("Failed to download generated avatar image, using source URL directly");
      return sourceUrl;
    }

    const contentType = imageRes.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
    const path = `generated/${avatarId}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, imageBytes, {
        contentType,
        upsert: true,
      });

    if (uploadErr) {
      console.error("Failed to persist avatar to storage:", uploadErr.message);
      return sourceUrl;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("persistImageFromUrl error:", err);
    return sourceUrl;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
