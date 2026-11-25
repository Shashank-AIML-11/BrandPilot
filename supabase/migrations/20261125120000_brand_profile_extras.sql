-- Optional extra Brand Profile fields that sharpen the brand brain's playbook.
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS current_offers TEXT NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS testimonials TEXT NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS competitors TEXT NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS locations TEXT NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS languages TEXT NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS voice_dos_donts TEXT NOT NULL DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS compliance_notes TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
