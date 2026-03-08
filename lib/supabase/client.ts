import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      video_clips: {
        Row: {
          id: string;
          filename: string;
          storage_path: string;
          duration_seconds: number | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          filename: string;
          storage_path: string;
          duration_seconds?: number | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          filename?: string;
          storage_path?: string;
          duration_seconds?: number | null;
          status?: string;
          created_at?: string;
        };
      };
      detection_jobs: {
        Row: {
          id: string;
          video_clip_id: string;
          status: string;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          video_clip_id: string;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          video_clip_id?: string;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
      };
      detected_persons: {
        Row: {
          id: string;
          detection_job_id: string;
          label: string;
          confidence: number;
          bounding_box: { x: number; y: number; width: number; height: number } | null;
          thumbnail_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          detection_job_id: string;
          label: string;
          confidence: number;
          bounding_box?: { x: number; y: number; width: number; height: number } | null;
          thumbnail_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          detection_job_id?: string;
          label?: string;
          confidence?: number;
          bounding_box?: { x: number; y: number; width: number; height: number } | null;
          thumbnail_path?: string | null;
          created_at?: string;
        };
      };
      avatars: {
        Row: {
          id: string;
          name: string;
          source_image_path: string | null;
          thumbnail_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          source_image_path?: string | null;
          thumbnail_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          source_image_path?: string | null;
          thumbnail_path?: string | null;
          created_at?: string;
        };
      };
    };
  };
};
