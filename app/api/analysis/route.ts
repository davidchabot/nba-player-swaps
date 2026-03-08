import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';
import { runAnalysisPipeline } from '@/lib/analysis';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/analysis
 * Start a new video analysis job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoClipId } = body;

    if (!videoClipId) {
      return NextResponse.json(
        { error: 'videoClipId is required' },
        { status: 400 }
      );
    }

    // Get video clip from database
    const { data: video, error: videoError } = await supabaseAdmin
      .from('video_clips')
      .select('*')
      .eq('id', videoClipId)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Check if there's already an analysis job in progress for this video
    const { data: existingJob } = await supabaseAdmin
      .from('analysis_jobs')
      .select('*')
      .eq('video_clip_id', videoClipId)
      .in('status', ['pending', 'scene_detection', 'tracking', 'quality_scoring', 'thumbnail_generation'])
      .single();

    if (existingJob) {
      return NextResponse.json({
        jobId: existingJob.id,
        status: existingJob.status,
        message: 'Analysis already in progress',
      });
    }

    // Also check if there's a completed job with tracks - reuse it
    const { data: completedJob } = await supabaseAdmin
      .from('analysis_jobs')
      .select('*')
      .eq('video_clip_id', videoClipId)
      .eq('status', 'completed')
      .single();

    if (completedJob?.result?.tracks?.length > 0) {
      return NextResponse.json({
        jobId: completedJob.id,
        status: completedJob.status,
        message: 'Using existing analysis',
      });
    }

    // Delete any failed or empty completed jobs so we can start fresh
    await supabaseAdmin
      .from('analysis_jobs')
      .delete()
      .eq('video_clip_id', videoClipId)
      .or('status.eq.failed,and(status.eq.completed,result->tracks.eq.[])');

    console.log('Starting fresh analysis for video:', videoClipId);

    // Create new analysis job
    const jobId = uuidv4();
    const { error: insertError } = await supabaseAdmin
      .from('analysis_jobs')
      .insert({
        id: jobId,
        video_clip_id: videoClipId,
        status: 'pending',
        progress: 0,
        current_step: 'initializing',
      });

    if (insertError) {
      console.error('Failed to create analysis job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create analysis job' },
        { status: 500 }
      );
    }

    // Get video URL
    const videoUrl = getPublicUrl(STORAGE_BUCKETS.VIDEOS, video.storage_path);

    // Start analysis in background
    // Note: In production, this would be a queue job (e.g., Inngest, BullMQ)
    runAnalysisInBackground(jobId, videoUrl, videoClipId);

    return NextResponse.json({
      jobId,
      status: 'pending',
      estimatedTime: 30, // seconds
    }, { status: 201 });

  } catch (error) {
    console.error('Analysis API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Run analysis pipeline in background
 * Updates database with progress
 */
async function runAnalysisInBackground(
  jobId: string,
  videoUrl: string,
  clipId: string
) {
  try {
    // Update status to processing
    await supabaseAdmin
      .from('analysis_jobs')
      .update({
        status: 'scene_detection',
        progress: 5,
        current_step: 'Starting analysis',
        started_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Run the pipeline with progress callbacks
    const result = await runAnalysisPipeline(videoUrl, clipId, {
      onProgress: async (step, progress) => {
        await supabaseAdmin
          .from('analysis_jobs')
          .update({
            status: step === 'completed' ? 'completed' : step,
            progress,
            current_step: step,
          })
          .eq('id', jobId);
      },
    });

    // Save result
    await supabaseAdmin
      .from('analysis_jobs')
      .update({
        status: 'completed',
        progress: 100,
        current_step: 'done',
        result: result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Also save tracks to the tracks table for easier querying
    for (const track of result.tracks) {
      const segment = result.segments.find(s => s.segmentId === track.segmentId);

      await supabaseAdmin
        .from('tracks')
        .insert({
          id: track.trackId,
          analysis_job_id: jobId,
          segment_id: track.segmentId,
          detections: track.detections,
          quality_score: track.quality.score,
          quality_coverage: track.quality.coverageFrames,
          quality_stability: track.quality.stability,
          quality_occlusion_rate: track.quality.occlusionRate,
          quality_sharpness: track.quality.sharpness,
          start_frame: track.frameRange[0],
          end_frame: track.frameRange[1],
          is_active: track.isActive,
          lost_at_frame: track.lostAtFrame || null,
        });

      // Save thumbnails
      for (const keyframe of track.keyframes) {
        await supabaseAdmin
          .from('track_thumbnails')
          .insert({
            track_id: track.trackId,
            thumbnail_type: keyframe.type,
            frame_number: keyframe.frame,
            timestamp_seconds: keyframe.timestamp,
            storage_path: keyframe.thumbUrl || '',
            score: 0,
          });
      }
    }

    console.log(`Analysis job ${jobId} completed with ${result.tracks.length} tracks`);

  } catch (error) {
    console.error('Analysis pipeline error:', error);

    await supabaseAdmin
      .from('analysis_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}
