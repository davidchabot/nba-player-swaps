CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.avatars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'My Avatar',
  source_image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  kling_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  url TEXT,
  duration_seconds NUMERIC,
  fps INTEGER,
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.analysis_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  scene_count INTEGER,
  total_frames INTEGER,
  error_message TEXT,
  replicate_prediction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.player_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_job_id UUID NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  quality_score NUMERIC NOT NULL DEFAULT 0,
  coverage NUMERIC NOT NULL DEFAULT 0,
  stability NUMERIC NOT NULL DEFAULT 0,
  sharpness NUMERIC NOT NULL DEFAULT 0,
  occlusion NUMERIC NOT NULL DEFAULT 0,
  frame_start INTEGER NOT NULL DEFAULT 0,
  frame_end INTEGER NOT NULL DEFAULT 0,
  keyframes JSONB DEFAULT '[]',
  bounding_boxes JSONB DEFAULT '[]',
  mask_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.replacement_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  avatar_id UUID NOT NULL REFERENCES public.avatars(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  output_storage_path TEXT,
  output_url TEXT,
  error_message TEXT,
  flowrvs_task_id TEXT,
  kling_swap_task_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analysis_jobs_video_id ON public.analysis_jobs(video_id);
CREATE INDEX idx_player_tracks_analysis_job_id ON public.player_tracks(analysis_job_id);
CREATE INDEX idx_replacement_jobs_video_id ON public.replacement_jobs(video_id);
CREATE INDEX idx_replacement_jobs_avatar_id ON public.replacement_jobs(avatar_id);

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to avatars" ON public.avatars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to videos" ON public.videos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to analysis_jobs" ON public.analysis_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to player_tracks" ON public.player_tracks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to replacement_jobs" ON public.replacement_jobs FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('results', 'results', true);

CREATE POLICY "Allow public read on avatars bucket" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Allow public insert on avatars bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Allow public read on videos bucket" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "Allow public insert on videos bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos');
CREATE POLICY "Allow public read on results bucket" ON storage.objects FOR SELECT USING (bucket_id = 'results');
CREATE POLICY "Allow public insert on results bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'results');

ALTER PUBLICATION supabase_realtime ADD TABLE public.analysis_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.replacement_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.avatars;