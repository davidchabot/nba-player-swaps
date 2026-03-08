import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, STORAGE_BUCKETS, getPublicUrl } from '@/lib/supabase/server';
import { createCircularThumbnail } from '@/lib/detection/thumbnail';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const image = formData.get('image') as File | null;

    if (!name) {
      return NextResponse.json(
        { error: 'Avatar name is required' },
        { status: 400 }
      );
    }

    const avatarId = uuidv4();
    let sourceImagePath: string | null = null;
    let thumbnailPath: string | null = null;

    if (image) {
      const imageBuffer = Buffer.from(await image.arrayBuffer());

      // Upload source image
      const fileExtension = image.name.split('.').pop() || 'jpg';
      sourceImagePath = `${avatarId}/source.${fileExtension}`;

      const { error: sourceError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKETS.AVATARS)
        .upload(sourceImagePath, imageBuffer, {
          contentType: image.type,
          upsert: true,
        });

      if (sourceError) {
        console.error('Source image upload error:', sourceError);
        return NextResponse.json(
          { error: 'Failed to upload avatar image' },
          { status: 500 }
        );
      }

      // Create and upload thumbnail
      try {
        const thumbnailBuffer = await createCircularThumbnail(imageBuffer, 100);
        thumbnailPath = `${avatarId}/thumbnail.png`;

        await supabaseAdmin.storage
          .from(STORAGE_BUCKETS.AVATARS)
          .upload(thumbnailPath, thumbnailBuffer, {
            contentType: 'image/png',
            upsert: true,
          });
      } catch (thumbError) {
        console.error('Thumbnail creation error:', thumbError);
        // Continue without thumbnail
      }
    }

    // Create database record
    const { data: avatar, error: dbError } = await supabaseAdmin
      .from('avatars')
      .insert({
        id: avatarId,
        name,
        source_image_path: sourceImagePath,
        thumbnail_path: thumbnailPath,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      return NextResponse.json(
        { error: 'Failed to create avatar' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: avatar.id,
      name: avatar.name,
      sourceImageUrl: avatar.source_image_path
        ? getPublicUrl(STORAGE_BUCKETS.AVATARS, avatar.source_image_path)
        : null,
      thumbnailUrl: avatar.thumbnail_path
        ? getPublicUrl(STORAGE_BUCKETS.AVATARS, avatar.thumbnail_path)
        : null,
    }, { status: 201 });

  } catch (error) {
    console.error('Avatar creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { data: avatars, error } = await supabaseAdmin
      .from('avatars')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formattedAvatars = avatars.map((avatar) => ({
      id: avatar.id,
      name: avatar.name,
      sourceImageUrl: avatar.source_image_path
        ? getPublicUrl(STORAGE_BUCKETS.AVATARS, avatar.source_image_path)
        : null,
      thumbnailUrl: avatar.thumbnail_path
        ? getPublicUrl(STORAGE_BUCKETS.AVATARS, avatar.thumbnail_path)
        : null,
      createdAt: avatar.created_at,
    }));

    return NextResponse.json(formattedAvatars);
  } catch (error) {
    console.error('Error fetching avatars:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
