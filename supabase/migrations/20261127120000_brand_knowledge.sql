-- Brand knowledge: everything the Brand Brain has read for a brand beyond the profile text.
-- One row per source: an uploaded strategy or guidelines document, a hero product photo,
-- a brand asset, a scanned website, or a competitor website. The Brand Brain reads these rows
-- when it builds the playbook and when it writes content, so uploads shape what gets posted.
--
-- Run on the STAGING Supabase project first, test, then on production before promoting to main.

CREATE TABLE IF NOT EXISTS public.brand_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('document', 'product_photo', 'asset', 'website', 'competitor')),
  -- storage path for files, the address for websites
  source_path text NOT NULL,
  source_name text NOT NULL DEFAULT '',
  -- processing: still being read (long documents are read a piece at a time); ready; failed
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error text,
  -- full extracted text of a document (capped by the server), used to finish reading in steps
  text_content text NOT NULL DEFAULT '',
  -- how many text pieces of a long document have been read so far
  progress integer NOT NULL DEFAULT 0,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, kind, source_path)
);

CREATE INDEX IF NOT EXISTS brand_knowledge_brand_idx ON public.brand_knowledge (brand_id, kind);

ALTER TABLE public.brand_knowledge ENABLE ROW LEVEL SECURITY;

-- Owners can read what the Brand Brain knows about their brands. Only the server writes.
DROP POLICY IF EXISTS "Users read own brand knowledge" ON public.brand_knowledge;
CREATE POLICY "Users read own brand knowledge" ON public.brand_knowledge
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
