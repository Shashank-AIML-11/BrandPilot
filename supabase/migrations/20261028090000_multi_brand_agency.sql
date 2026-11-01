-- Multi-brand support for the Scale (agency) plan.
-- Safe to re-run: every statement is idempotent.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR *BEFORE* DEPLOYING THE MATCHING CODE
-- (staging project first, then production).

-- 1) A user may own several brands (was: exactly one, via UNIQUE(user_id)).
ALTER TABLE public.brand_profiles DROP CONSTRAINT IF EXISTS brand_profiles_user_id_key;
CREATE INDEX IF NOT EXISTS brand_profiles_user_created_idx
  ON public.brand_profiles (user_id, created_at);

-- 2) Everything generated belongs to one brand.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brand_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.content_generation_jobs
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brand_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.content_strategies
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brand_profiles(id) ON DELETE CASCADE;

-- 3) Existing rows belong to the user's existing (first) brand.
WITH first_brand AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.brand_profiles
  ORDER BY user_id, created_at, id
)
UPDATE public.content_items t SET brand_id = fb.id
FROM first_brand fb WHERE fb.user_id = t.user_id AND t.brand_id IS NULL;

WITH first_brand AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.brand_profiles
  ORDER BY user_id, created_at, id
)
UPDATE public.content_generation_jobs t SET brand_id = fb.id
FROM first_brand fb WHERE fb.user_id = t.user_id AND t.brand_id IS NULL;

WITH first_brand AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.brand_profiles
  ORDER BY user_id, created_at, id
)
UPDATE public.content_strategies t SET brand_id = fb.id
FROM first_brand fb WHERE fb.user_id = t.user_id AND t.brand_id IS NULL;

-- 4) One active generation job per BRAND per month (was: per user per month).
DROP INDEX IF EXISTS public.content_generation_jobs_active_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS content_generation_jobs_active_brand_uniq
  ON public.content_generation_jobs (brand_id, month)
  WHERE status IN ('pending', 'running');

-- One strategy per BRAND per week (was: per user per week).
ALTER TABLE public.content_strategies
  DROP CONSTRAINT IF EXISTS content_strategies_user_id_week_start_key;
CREATE UNIQUE INDEX IF NOT EXISTS content_strategies_brand_week_uniq
  ON public.content_strategies (brand_id, week_start);

CREATE INDEX IF NOT EXISTS content_items_brand_date_idx
  ON public.content_items (brand_id, scheduled_date);

-- 5) Enforce the plan's brand limit in the database, so it cannot be bypassed
--    by calling the API directly. Keep the numbers in sync with src/lib/plans.ts
--    (starter 1, growth 2, scale 20). Root account is treated as Scale.
CREATE OR REPLACE FUNCTION public.enforce_brand_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_count integer;
  v_email text;
  v_plan  text;
BEGIN
  -- Serialise concurrent inserts for the same user so the count below is exact.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));

  SELECT lower(trim(email)) INTO v_email FROM public.profiles WHERE id = NEW.user_id;

  IF v_email = 'shashank.bawane@gmail.com' THEN
    v_limit := 20;
  ELSE
    SELECT plan INTO v_plan
    FROM public.subscriptions
    WHERE user_id = NEW.user_id AND status IN ('pending', 'active')
    ORDER BY created_at DESC
    LIMIT 1;
    v_limit := CASE v_plan WHEN 'scale' THEN 20 WHEN 'growth' THEN 2 ELSE 1 END;
  END IF;

  SELECT count(*) INTO v_count FROM public.brand_profiles WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Brand limit reached: your plan includes % brand(s).', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_brand_profiles_limit ON public.brand_profiles;
CREATE TRIGGER t_brand_profiles_limit
  BEFORE INSERT ON public.brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_brand_limit();

NOTIFY pgrst, 'reload schema';
