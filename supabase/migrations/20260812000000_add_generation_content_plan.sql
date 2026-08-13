-- Stores the per-date plan allowance so the durable worker cannot produce more
-- content than was granted when the month was queued.
ALTER TABLE public.content_generation_jobs
  ADD COLUMN IF NOT EXISTS content_plan jsonb NOT NULL DEFAULT '{}'::jsonb;
