-- Post performance metrics: one snapshot per published post, per channel, per age bucket.
-- Snapshots (not overwrites) so the learning loop can compare 24h / 3d / 7d / 14d results
-- and so a post that was measured early is never mistaken for a post that flopped.

CREATE TABLE IF NOT EXISTS public.post_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  publish_log_id uuid NOT NULL REFERENCES public.publish_log(id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_id text NOT NULL DEFAULT '',
  bucket text NOT NULL CHECK (bucket IN ('h24', 'h72', 'd7', 'd14')),
  -- false = the platform refused or could not return numbers (missing scope, deleted post...).
  -- Such rows are kept so we do not retry forever, but are NEVER counted as "zero performance".
  ok boolean NOT NULL DEFAULT true,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  engagements integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publish_log_id, bucket)
);

CREATE INDEX IF NOT EXISTS idx_post_metric_snapshots_item
  ON public.post_metric_snapshots (content_item_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_metric_snapshots_user
  ON public.post_metric_snapshots (user_id, fetched_at DESC);

GRANT SELECT ON public.post_metric_snapshots TO authenticated;
GRANT ALL ON public.post_metric_snapshots TO service_role;
ALTER TABLE public.post_metric_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_metric_snapshots_select_own ON public.post_metric_snapshots
FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Set only when at least one channel returned real numbers. The strategy loop
-- learns only from rows where this is not null.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS metrics_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_publish_log_posted_recent
  ON public.publish_log (status, created_at DESC);
