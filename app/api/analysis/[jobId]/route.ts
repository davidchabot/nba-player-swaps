import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { AnalysisStatusResponse } from '@/lib/types';

/**
 * GET /api/analysis/[jobId]
 * Get the status and results of an analysis job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Get job from database
    const { data: job, error: jobError } = await supabaseAdmin
      .from('analysis_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Analysis job not found' },
        { status: 404 }
      );
    }

    const response: AnalysisStatusResponse = {
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      currentStep: job.current_step,
      result: job.result || undefined,
      errorMessage: job.error_message || undefined,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Get analysis job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analysis/[jobId]
 * Cancel an in-progress analysis job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Update job status to cancelled
    const { error } = await supabaseAdmin
      .from('analysis_jobs')
      .update({
        status: 'failed',
        error_message: 'Cancelled by user',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['pending', 'scene_detection', 'tracking', 'quality_scoring', 'thumbnail_generation']);

    if (error) {
      console.error('Failed to cancel job:', error);
      return NextResponse.json(
        { error: 'Failed to cancel job' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Cancel analysis job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
