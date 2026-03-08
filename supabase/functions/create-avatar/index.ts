import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Kling AI API endpoints
const KLING_BASE_URL = "https://api.klingai.com/v1";

async function getKlingToken(): Promise<string> {
  const accessKey = Deno.env.get("KLING_ACCESS_KEY");
  const secretKey = Deno.env.get("KLING_SECRET_KEY");
  if (!accessKey || !secretKey) throw new Error("Kling AI keys not configured");

  // Kling uses JWT-style auth: create a JWT with the access key
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(
    JSON.stringify({
      iss: accessKey,
      exp: now + 1800,
      nbf: now - 5,
      iat: now,
    })
  );
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${payload}`)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${payload}.${sig}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { avatar_id, image_url, name } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If no avatar_id provided, create one
    let avatarId = avatar_id;
    if (!avatarId) {
      const { data: newAvatar, error: insertErr } = await supabase
        .from("avatars")
        .insert({
          name: name || "My Avatar",
          source_image_url: image_url,
          status: "processing",
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      avatarId = newAvatar.id;
    } else {
      await supabase
        .from("avatars")
        .update({ status: "processing" })
        .eq("id", avatarId);
    }

    // Call Kling AI to generate a face swap / virtual try-on image
    const token = await getKlingToken();
    const klingRes = await fetch(`${KLING_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_name: "kling-v1",
        prompt: `Professional portrait photo of ${name || "a person"}, high quality, studio lighting, clean background`,
        image: image_url,
        n: 1,
        aspect_ratio: "1:1",
      }),
    });

    if (!klingRes.ok) {
      const errText = await klingRes.text();
      console.error("Kling API error:", klingRes.status, errText);
      
      // Update avatar as completed with original image (fallback)
      await supabase
        .from("avatars")
        .update({
          status: "completed",
          thumbnail_url: image_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", avatarId);

      return new Response(
        JSON.stringify({
          success: true,
          avatar_id: avatarId,
          message: "Avatar created with original image (Kling enhancement unavailable)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const klingData = await klingRes.json();
    const taskId = klingData?.data?.task_id;

    await supabase
      .from("avatars")
      .update({
        kling_task_id: taskId || null,
        status: taskId ? "processing" : "completed",
        thumbnail_url: image_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", avatarId);

    return new Response(
      JSON.stringify({
        success: true,
        avatar_id: avatarId,
        kling_task_id: taskId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("create-avatar error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
