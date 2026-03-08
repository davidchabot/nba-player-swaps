import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Get job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('detection_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Detection job not found' },
        { status: 404 }
      );
    }

    // Get detected persons if job is completed
    let persons: Array<{
      id: string;
      label: string;
      confidence: number;
      boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
      thumbnailUrl: string | null;
    }> = [];

    if (job.status === 'completed') {
      const { data: detectedPersons, error: personsError } = await supabaseAdmin
        .from('detected_persons')
        .select('*')
        .eq('detection_job_id', jobId)
        .order('label', { ascending: true });

      if (!personsError && detectedPersons) {
        persons = detectedPersons.map((p) => ({
          id: p.id,
          label: p.label,
          confidence: p.confidence,
          boundingBox: p.bounding_box as {
            x: number;
            y: number;
            width: number;
            height: number;
          } | null,
          thumbnailUrl: p.thumbnail_path
            ? getPublicUrl(STORAGE_BUCKETS.THUMBNAILS, p.thumbnail_path)
            : null,
        }));
      }
    }

    return NextResponse.json({
      id: job.id,
      videoClipId: job.video_clip_id,
      status: job.status,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      persons,
    });

  } catch (error) {
    console.error('Get detection job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
