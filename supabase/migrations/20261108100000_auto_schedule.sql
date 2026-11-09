-- Automatic generation (production) + daily performance collection.
-- Safe to re-run. Run on STAGING first (it only adds tables/columns), then PRODUCTION.

-- 1) One row per brand per generation day: stops the same cycle from running twice and
--    shows when each brand was last generated.
CREATE TABLE IF NOT EXISTS public.auto_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  cycle_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, run_date)
);
GRANT SELECT ON public.auto_generation_log TO authenticated;
GRANT ALL ON public.auto_generation_log TO service_role;
ALTER TABLE public.auto_generation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auto_generation_log_select_own ON public.auto_generation_log;
CREATE POLICY auto_generation_log_select_own ON public.auto_generation_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 2) Daily performance snapshots (day1 ... day7) in addition to the older h24/h72/d7/d14.
ALTER TABLE public.post_metric_snapshots DROP CONSTRAINT IF EXISTS post_metric_snapshots_bucket_check;
ALTER TABLE public.post_metric_snapshots
  ADD CONSTRAINT post_metric_snapshots_bucket_check
  CHECK (bucket IN ('h24','h72','d7','d14','day1','day2','day3','day4','day5','day6','day7'));
