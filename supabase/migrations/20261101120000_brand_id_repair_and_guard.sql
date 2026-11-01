-- Fixes "content disappears after adding a second brand".
-- Every Brand page filters content by brand_id, so any row whose brand_id is empty
-- (or points at the wrong brand) vanishes as soon as an account has more than one brand.
-- Safe to re-run: every statement is idempotent.
--
-- RUN IN THE SUPABASE SQL EDITOR: staging project first, then production.

-- 1) Repair: rows without a brand belong to the user's oldest (first) brand.
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

-- 2) Guard: any future insert without a brand (old code, a stale deployment, a script)
--    is stamped with the user's first brand instead of being saved invisible.
CREATE OR REPLACE FUNCTION public.default_brand_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN
    SELECT id INTO NEW.brand_id
    FROM public.brand_profiles
    WHERE user_id = NEW.user_id
    ORDER BY created_at, id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_content_items_default_brand ON public.content_items;
CREATE TRIGGER t_content_items_default_brand
  BEFORE INSERT ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.default_brand_id();

DROP TRIGGER IF EXISTS t_content_generation_jobs_default_brand ON public.content_generation_jobs;
CREATE TRIGGER t_content_generation_jobs_default_brand
  BEFORE INSERT ON public.content_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.default_brand_id();

DROP TRIGGER IF EXISTS t_content_strategies_default_brand ON public.content_strategies;
CREATE TRIGGER t_content_strategies_default_brand
  BEFORE INSERT ON public.content_strategies
  FOR EACH ROW EXECUTE FUNCTION public.default_brand_id();

-- 3) Proof: every row should now belong to a brand. Expect "0".
SELECT count(*) AS content_items_still_without_brand
FROM public.content_items WHERE brand_id IS NULL;
