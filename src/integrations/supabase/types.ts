export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analysis_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          progress: number
          replicate_prediction_id: string | null
          scene_count: number | null
          status: string
          total_frames: number | null
          updated_at: string
          video_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          progress?: number
          replicate_prediction_id?: string | null
          scene_count?: number | null
          status?: string
          total_frames?: number | null
          updated_at?: string
          video_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          progress?: number
          replicate_prediction_id?: string | null
          scene_count?: number | null
          status?: string
          total_frames?: number | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      avatars: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          kling_task_id: string | null
          name: string
          source_image_url: string
          status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          kling_task_id?: string | null
          name?: string
          source_image_url: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          kling_task_id?: string | null
          name?: string
          source_image_url?: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      player_tracks: {
        Row: {
          analysis_job_id: string
          bounding_boxes: Json | null
          coverage: number
          created_at: string
          frame_end: number
          frame_start: number
          id: string
          keyframes: Json | null
          mask_data: Json | null
          occlusion: number
          quality_score: number
          sharpness: number
          stability: number
          track_id: string
        }
        Insert: {
          analysis_job_id: string
          bounding_boxes?: Json | null
          coverage?: number
          created_at?: string
          frame_end?: number
          frame_start?: number
          id?: string
          keyframes?: Json | null
          mask_data?: Json | null
          occlusion?: number
          quality_score?: number
          sharpness?: number
          stability?: number
          track_id: string
        }
        Update: {
          analysis_job_id?: string
          bounding_boxes?: Json | null
          coverage?: number
          created_at?: string
          frame_end?: number
          frame_start?: number
          id?: string
          keyframes?: Json | null
          mask_data?: Json | null
          occlusion?: number
          quality_score?: number
          sharpness?: number
          stability?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_tracks_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      replacement_jobs: {
        Row: {
          avatar_id: string
          created_at: string
          error_message: string | null
          flowrvs_task_id: string | null
          id: string
          kling_swap_task_id: string | null
          output_storage_path: string | null
          output_url: string | null
          progress: number
          status: string
          track_id: string
          updated_at: string
          video_id: string
        }
        Insert: {
          avatar_id: string
          created_at?: string
          error_message?: string | null
          flowrvs_task_id?: string | null
          id?: string
          kling_swap_task_id?: string | null
          output_storage_path?: string | null
          output_url?: string | null
          progress?: number
          status?: string
          track_id: string
          updated_at?: string
          video_id: string
        }
        Update: {
          avatar_id?: string
          created_at?: string
          error_message?: string | null
          flowrvs_task_id?: string | null
          id?: string
          kling_swap_task_id?: string | null
          output_storage_path?: string | null
          output_url?: string | null
          progress?: number
          status?: string
          track_id?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacement_jobs_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string
          duration_seconds: number | null
          filename: string
          fps: number | null
          id: string
          resolution: string | null
          status: string
          storage_path: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          filename: string
          fps?: number | null
          id?: string
          resolution?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          filename?: string
          fps?: number | null
          id?: string
          resolution?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
