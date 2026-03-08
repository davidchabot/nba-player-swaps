import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS } from '@/lib/supabase/server';
import { getFaceSwapStatus } from '@/lib/kling/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Get job from database
    const { data: job, error: jobError } = await supabaseAdmin
      .from('swap_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Swap job not found' },
        { status: 404 }
      );
    }

    // If job is already completed or failed, return cached result
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json({
        id: job.id,
        status: job.status,
        progress: job.status === 'completed' ? 100 : job.progress,
        outputVideoUrl: job.output_video_url,
        errorMessage: job.error_message,
      });
    }

    // Check status with Kling AI
    let klingStatus;
    try {
      klingStatus = await getFaceSwapStatus(job.kling_task_id);
    } catch (klingError) {
      console.error('Error fetching Kling status:', klingError);
      // Return current database state if Kling API fails
      return NextResponse.json({
        id: job.id,
        status: job.status,
        progress: job.progress || 0,
        outputVideoUrl: null,
        errorMessage: null,
      });
    }

    // Map Kling status to our status
    let newStatus = job.status;
    let progress = job.progress || 0;
    let outputVideoUrl = job.output_video_url;
    let errorMessage = job.error_message;

    if (klingStatus.status === 'succeed') {
      newStatus = 'completed';
      progress = 100;
      outputVideoUrl = klingStatus.videoUrl || null;

      // Optionally download and store the video in Supabase
      if (klingStatus.videoUrl) {
        try {
          // Download video from Kling
          const videoResponse = await fetch(klingStatus.videoUrl);
          const videoBlob = await videoResponse.blob();
          const videoBuffer = Buffer.from(await videoBlob.arrayBuffer());

          // Upload to Supabase
          const outputPath = `${jobId}/output.mp4`;
          await supabaseAdmin.storage
            .from(STORAGE_BUCKETS.VIDEOS)
            .upload(outputPath, videoBuffer, {
              contentType: 'video/mp4',
              upsert: true,
            });

          // Get public URL
          const { data: urlData } = supabaseAdmin.storage
            .from(STORAGE_BUCKETS.VIDEOS)
            .getPublicUrl(outputPath);

          outputVideoUrl = urlData.publicUrl;
        } catch (downloadError) {
          console.error('Error downloading/storing video:', downloadError);
          // Keep the Kling URL as fallback
          outputVideoUrl = klingStatus.videoUrl;
        }
      }
    } else if (klingStatus.status === 'failed') {
      newStatus = 'failed';
      errorMessage = klingStatus.errorMessage || 'Face swap failed';
    } else if (klingStatus.status === 'processing') {
      newStatus = 'processing';
      progress = klingStatus.progress || Math.min((job.progress || 0) + 10, 90);
    }

    // Update database
    await supabaseAdmin
      .from('swap_jobs')
      .update({
        status: newStatus,
        progress,
        output_video_url: outputVideoUrl,
        error_message: errorMessage,
        completed_at: newStatus === 'completed' || newStatus === 'failed'
          ? new Date().toISOString()
          : null,
      })
      .eq('id', jobId);

    return NextResponse.json({
      id: job.id,
      status: newStatus,
      progress,
      outputVideoUrl,
      errorMessage,
    });

  } catch (error) {
    console.error('Get swap job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
