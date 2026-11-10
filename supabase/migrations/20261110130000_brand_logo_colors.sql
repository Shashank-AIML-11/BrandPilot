-- Brand logo (storage path in the content-media bucket) and brand colours for designed posters.
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS brand_colors jsonb NOT NULL DEFAULT '{}'::jsonb;
