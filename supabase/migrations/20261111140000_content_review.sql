-- Review step: a piece is "Reviewed - Ready to Post" once reviewed_at is set.
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
