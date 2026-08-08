ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS video_job_id text,
  ADD COLUMN IF NOT EXISTS video_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS video_error text,
  ADD COLUMN IF NOT EXISTS voiceover_url text;

UPDATE public.content_items SET voiceover_url = video_url WHERE video_url IS NOT NULL AND video_url LIKE '%.mp3';
UPDATE public.content_items SET video_url = NULL WHERE video_url IS NOT NULL AND video_url LIKE '%.mp3';