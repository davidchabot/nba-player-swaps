import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params;

    // Get video record from database
    const { data: video, error: fetchError } = await supabaseAdmin
      .from('video_clips')
      .select('*')
      .eq('id', videoId)
      .single();

    if (fetchError || !video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Check if frames were uploaded via request body (client-side extraction)
    const contentType = request.headers.get('content-type');

    if (contentType?.includes('multipart/form-data')) {
      // Client uploaded frames
      const formData = await request.formData();
      const frameUrls: string[] = [];

      let frameIndex = 0;
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('frame') && value instanceof File) {
          const framePath = `${videoId}/frame-${String(frameIndex).padStart(3, '0')}.jpg`;
          const buffer = Buffer.from(await value.arrayBuffer());

          const { error: uploadError } = await supabaseAdmin.storage
            .from(STORAGE_BUCKETS.FRAMES)
            .upload(framePath, buffer, {
              contentType: 'image/jpeg',
              upsert: true,
            });

          if (!uploadError) {
            frameUrls.push(getPublicUrl(STORAGE_BUCKETS.FRAMES, framePath));
            frameIndex++;
          }
        }
      }

      // Update video status
      await supabaseAdmin
        .from('video_clips')
        .update({ status: 'ready' })
        .eq('id', videoId);

      return NextResponse.json({
        frameCount: frameUrls.length,
        frameUrls,
      });
    }

    // No frames provided - just mark video as ready
    // Detection will use the video URL directly
    await supabaseAdmin
      .from('video_clips')
      .update({ status: 'ready' })
      .eq('id', videoId);

    return NextResponse.json({
      frameCount: 0,
      frameUrls: [],
      message: 'Video marked as ready. Frames will be extracted during detection.',
    });

  } catch (error) {
    console.error('Frame extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to process frames' },
      { status: 500 }
    );
  }
}
