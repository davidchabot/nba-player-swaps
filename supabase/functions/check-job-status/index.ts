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
    const { job_type, job_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (job_type === "analysis") {
      const { data: job } = await supabase
        .from("analysis_jobs")
        .select("*")
        .eq("id", job_id)
        .single();

      let tracks: any[] = [];
      if (job?.status === "completed") {
        const { data } = await supabase
          .from("player_tracks")
          .select("*")
          .eq("analysis_job_id", job_id)
          .order("quality_score", { ascending: false });
        tracks = data || [];
      }

      return new Response(
        JSON.stringify({ job, tracks }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job_type === "replacement") {
      const { data: job } = await supabase
        .from("replacement_jobs")
        .select("*")
        .eq("id", job_id)
        .single();

      return new Response(
        JSON.stringify({ job }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job_type === "avatar") {
      const { data: avatar } = await supabase
        .from("avatars")
        .select("*")
        .eq("id", job_id)
        .single();

      return new Response(
        JSON.stringify({ avatar }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid job_type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-job-status error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
