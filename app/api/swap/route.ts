import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';
import { startFaceSwap } from '@/lib/kling/client';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { avatarId, videoClipId, detectedPersonId } = body;

    if (!avatarId || !videoClipId) {
      return NextResponse.json(
        { error: 'avatarId and videoClipId are required' },
        { status: 400 }
      );
    }

    // Get avatar
    const { data: avatar, error: avatarError } = await supabaseAdmin
      .from('avatars')
      .select('*')
      .eq('id', avatarId)
      .single();

    if (avatarError || !avatar) {
      return NextResponse.json(
        { error: 'Avatar not found' },
        { status: 404 }
      );
    }

    // Get video
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

    // Get public URLs for Kling API
    const videoUrl = getPublicUrl(STORAGE_BUCKETS.VIDEOS, video.storage_path);
    const faceImageUrl = avatar.source_image_path
      ? getPublicUrl(STORAGE_BUCKETS.AVATARS, avatar.source_image_path)
      : null;

    if (!faceImageUrl) {
      return NextResponse.json(
        { error: 'Avatar has no source image' },
        { status: 400 }
      );
    }

    // Get face index from detected person if provided
    let faceIndex = 0;
    if (detectedPersonId) {
      const { data: person } = await supabaseAdmin
        .from('detected_persons')
        .select('*')
        .eq('id', detectedPersonId)
        .single();

      if (person?.label) {
        // Extract number from "Person 1", "Person 2", etc.
        const match = person.label.match(/\d+/);
        if (match) {
          faceIndex = parseInt(match[0]) - 1; // 0-indexed
        }
      }
    }

    // Create swap job record
    const jobId = uuidv4();

    // Start face swap with Kling AI
    let klingTaskId: string;
    try {
      const klingResponse = await startFaceSwap({
        videoUrl,
        faceImageUrl,
        faceIndex,
      });
      klingTaskId = klingResponse.taskId;
    } catch (klingError) {
      console.error('Kling API error:', klingError);
      return NextResponse.json(
        { error: `Kling AI error: ${klingError instanceof Error ? klingError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Save job to database
    const { error: dbError } = await supabaseAdmin
      .from('swap_jobs')
      .insert({
        id: jobId,
        avatar_id: avatarId,
        video_clip_id: videoClipId,
        detected_person_id: detectedPersonId || null,
        kling_task_id: klingTaskId,
        status: 'processing',
        progress: 0,
      });

    if (dbError) {
      console.error('Database error:', dbError);
      // Continue anyway - the Kling job is already started
    }

    return NextResponse.json({
      jobId,
      klingTaskId,
      status: 'processing',
    }, { status: 201 });

  } catch (error) {
    console.error('Swap API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
