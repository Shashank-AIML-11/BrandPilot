-- Channel connections per BRAND (Scale plan): each brand connects its own social accounts.
-- Run on STAGING first, then production, BEFORE deploying the matching code.
-- Safe to re-run.

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brand_profiles(id) ON DELETE CASCADE;

-- Existing connections belong to the account's first (oldest) brand.
WITH first_brand AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.brand_profiles
  ORDER BY user_id, created_at, id
)
UPDATE public.channel_connections c SET brand_id = fb.id
FROM first_brand fb WHERE fb.user_id = c.user_id AND c.brand_id IS NULL;

-- One connection per user + brand + channel (was: per user + channel).
ALTER TABLE public.channel_connections DROP CONSTRAINT IF EXISTS channel_connections_user_id_channel_key;
CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_user_brand_channel_key
  ON public.channel_connections (user_id, brand_id, channel);

-- Check: every connection should now show a brand.
SELECT channel, brand_id IS NOT NULL AS has_brand, count(*) FROM public.channel_connections GROUP BY 1, 2;
