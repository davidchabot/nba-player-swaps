import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('video') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: MP4, MOV, WebM' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 100MB' },
        { status: 400 }
      );
    }

    const videoId = uuidv4();
    const fileExtension = file.name.split('.').pop() || 'mp4';
    const storagePath = `${videoId}/original.${fileExtension}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKETS.VIDEOS)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload video' },
        { status: 500 }
      );
    }

    // Create database record
    const { data: videoClip, error: dbError } = await supabaseAdmin
      .from('video_clips')
      .insert({
        id: videoId,
        filename: file.name,
        storage_path: storagePath,
        status: 'uploaded',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Try to clean up the uploaded file
      await supabaseAdmin.storage.from(STORAGE_BUCKETS.VIDEOS).remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to save video record' },
        { status: 500 }
      );
    }

    const publicUrl = getPublicUrl(STORAGE_BUCKETS.VIDEOS, storagePath);

    return NextResponse.json({
      id: videoClip.id,
      url: publicUrl,
      filename: videoClip.filename,
    }, { status: 201 });

  } catch (error) {
    console.error('Video upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { data: videos, error } = await supabaseAdmin
      .from('video_clips')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(videos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
