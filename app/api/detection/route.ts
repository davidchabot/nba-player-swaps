import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';
import { detectPersonsInImage } from '@/lib/detection/detector';
import { cropPerson } from '@/lib/detection/thumbnail';
import { v4 as uuidv4 } from 'uuid';

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

    // Verify video exists
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

    // Create detection job
    const jobId = uuidv4();
    const { error: jobError } = await supabaseAdmin
      .from('detection_jobs')
      .insert({
        id: jobId,
        video_clip_id: videoClipId,
        status: 'pending',
      });

    if (jobError) {
      console.error('Failed to create job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create detection job' },
        { status: 500 }
      );
    }

    // Start detection in background (don't await)
    runDetection(jobId, videoClipId).catch((error) => {
      console.error('Background detection failed:', error);
    });

    return NextResponse.json({
      jobId,
      status: 'pending',
    }, { status: 201 });

  } catch (error) {
    console.error('Detection API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function runDetection(jobId: string, videoClipId: string) {
  try {
    // Update job status to processing
    await supabaseAdmin
      .from('detection_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId);

    // List frames for this video
    const { data: frameFiles, error: listError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.FRAMES)
      .list(videoClipId);

    if (listError || !frameFiles || frameFiles.length === 0) {
      throw new Error('No frames found for video');
    }

    // Sort frames by name
    const sortedFrames = frameFiles
      .filter((f) => f.name.endsWith('.jpg'))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Sample frames (every 3rd frame to reduce API calls)
    const sampleIndices = [0, Math.floor(sortedFrames.length / 2), sortedFrames.length - 1]
      .filter((i) => i < sortedFrames.length);

    // Download and process sample frames
    let bestDetections: Awaited<ReturnType<typeof detectPersonsInImage>> = [];
    let bestFrameBuffer: Buffer | null = null;

    for (const index of sampleIndices) {
      const frame = sortedFrames[index];
      const framePath = `${videoClipId}/${frame.name}`;

      const { data: frameBlob, error: downloadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKETS.FRAMES)
        .download(framePath);

      if (downloadError || !frameBlob) {
        console.error(`Failed to download frame ${framePath}:`, downloadError);
        continue;
      }

      const frameBuffer = Buffer.from(await frameBlob.arrayBuffer());

      try {
        const detections = await detectPersonsInImage(frameBuffer, { minConfidence: 0.5 });

        // Keep the frame with most detections
        if (detections.length > bestDetections.length) {
          bestDetections = detections;
          bestFrameBuffer = frameBuffer;
        }

        // Add delay between API calls
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (detectionError) {
        console.error(`Detection failed for frame ${index}:`, detectionError);
        // Continue with next frame
      }
    }

    // If no detections, mark job as completed with empty results
    if (bestDetections.length === 0 || !bestFrameBuffer) {
      await supabaseAdmin
        .from('detection_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      return;
    }

    // Create thumbnails and save detected persons
    for (const detection of bestDetections) {
      try {
        // Crop person thumbnail
        const thumbnailBuffer = await cropPerson(bestFrameBuffer, detection.boundingBox);
        const thumbnailPath = `${jobId}/${detection.id}.jpg`;

        // Upload thumbnail
        await supabaseAdmin.storage
          .from(STORAGE_BUCKETS.THUMBNAILS)
          .upload(thumbnailPath, thumbnailBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        // Save to database
        await supabaseAdmin.from('detected_persons').insert({
          id: uuidv4(),
          detection_job_id: jobId,
          label: detection.label,
          confidence: detection.confidence,
          bounding_box: detection.boundingBox,
          thumbnail_path: thumbnailPath,
        });
      } catch (saveError) {
        console.error(`Failed to save person ${detection.id}:`, saveError);
      }
    }

    // Mark job as completed
    await supabaseAdmin
      .from('detection_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

  } catch (error) {
    console.error('Detection processing error:', error);

    // Mark job as failed
    await supabaseAdmin
      .from('detection_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', jobId);
  }
}
