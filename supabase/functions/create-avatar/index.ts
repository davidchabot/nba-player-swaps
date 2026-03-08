import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_url, name } = await req.json();
    if (!image_url) throw new Error("image_url is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create avatar record
    const { data: avatar, error: insertErr } = await supabase
      .from("avatars")
      .insert({
        name: name || "My Avatar",
        source_image_url: image_url,
        thumbnail_url: image_url,
        status: "completed",
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // Try Kling AI enhancement (non-blocking, graceful fallback)
    let klingTaskId: string | null = null;
    try {
      const accessKey = Deno.env.get("KLING_ACCESS_KEY");
      const secretKey = Deno.env.get("KLING_SECRET_KEY");
      
      if (accessKey && secretKey) {
        const token = await createKlingJWT(accessKey, secretKey);
        const klingRes = await fetch("https://api.klingai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_name: "kling-v1",
            prompt: `High quality portrait of ${name || "a person"}, studio lighting`,
            image: image_url,
            n: 1,
            aspect_ratio: "1:1",
          }),
        });

        if (klingRes.ok) {
          const klingData = await klingRes.json();
          klingTaskId = klingData?.data?.task_id;
          if (klingTaskId) {
            await supabase.from("avatars").update({
              kling_task_id: klingTaskId,
              status: "processing",
            }).eq("id", avatar.id);
          }
        } else {
          const errText = await klingRes.text();
          console.log("Kling API unavailable (non-fatal):", klingRes.status, errText);
        }
      }
    } catch (klingErr) {
      console.log("Kling enhancement skipped:", klingErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        avatar_id: avatar.id,
        kling_task_id: klingTaskId,
        status: klingTaskId ? "processing" : "completed",
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
