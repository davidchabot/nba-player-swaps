import { createClient } from '@supabase/supabase-js';
import type { Database } from './client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client with service role key for full database access
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Storage bucket names
export const STORAGE_BUCKETS = {
  VIDEOS: 'videos',
  FRAMES: 'frames',
  THUMBNAILS: 'thumbnails',
  AVATARS: 'avatars',
} as const;

// Helper to get public URL for a storage object
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Helper to upload a file to storage
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: Buffer | Blob,
  contentType: string
): Promise<{ path: string; error: Error | null }> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: true,
    });

  if (error) {
    return { path: '', error: new Error(error.message) };
  }

  return { path: data.path, error: null };
}

// Helper to download a file from storage
export async function downloadFromStorage(
  bucket: string,
  path: string
): Promise<{ data: Blob | null; error: Error | null }> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}
