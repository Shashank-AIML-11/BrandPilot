-- Brand Management (Scale plan): archive a brand.
-- Archiving copies the whole brand (profile, connected channel names, generated
-- content) into brand_archives, then removes the brand. Removing it:
--   * hides it from the brand list,
--   * disconnects every social account of that brand (its channel_connections rows are deleted),
--   * frees one of the plan's brand places (the 20-brand limit counts live brands only).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.brand_archives (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  original_brand_id uuid NOT NULL,
  business_name     text NOT NULL DEFAULT '',
  website           text NOT NULL DEFAULT '',
  description       text NOT NULL DEFAULT '',
  products_services text NOT NULL DEFAULT '',
  icp               text NOT NULL DEFAULT '',
  keywords          text NOT NULL DEFAULT '',
  brand             jsonb NOT NULL,                   -- the complete brand_profiles row
  connections       jsonb NOT NULL DEFAULT '[]'::jsonb, -- names of the channels that were connected (no tokens)
  content_items     jsonb NOT NULL DEFAULT '[]'::jsonb, -- the brand's generated content
  content_count     integer NOT NULL DEFAULT 0,
  archived_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_archives_user_idx ON public.brand_archives (user_id, archived_at DESC);

ALTER TABLE public.brand_archives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_archives_select_own ON public.brand_archives;
CREATE POLICY brand_archives_select_own ON public.brand_archives
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Writes happen only through archive_brand() on the server.

CREATE OR REPLACE FUNCTION public.archive_brand(p_user_id uuid, p_brand_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b          public.brand_profiles%ROWTYPE;
  live_count integer;
  conns      jsonb;
  items      jsonb;
  item_count integer;
  archive_id uuid;
BEGIN
  -- Same lock the brand-limit trigger uses, so counts stay exact.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT * INTO b FROM public.brand_profiles
   WHERE id = p_brand_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;

  SELECT count(*) INTO live_count FROM public.brand_profiles WHERE user_id = p_user_id;
  IF live_count <= 1 THEN
    RAISE EXCEPTION 'You need at least one active brand. Add a new brand first, then archive this one.';
  END IF;

  SELECT coalesce(jsonb_agg(channel), '[]'::jsonb)
    INTO conns FROM public.channel_connections WHERE brand_id = p_brand_id;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb), count(*)
    INTO items, item_count FROM public.content_items c WHERE c.brand_id = p_brand_id;

  INSERT INTO public.brand_archives (
    user_id, original_brand_id, business_name, website, description,
    products_services, icp, keywords, brand, connections, content_items, content_count
  ) VALUES (
    p_user_id, b.id, b.business_name, b.website, b.description,
    b.products_services, b.icp, b.keywords, to_jsonb(b), conns, items, item_count
  ) RETURNING id INTO archive_id;

  -- Disconnect every social account of this brand, then remove the brand
  -- (its generated content, jobs and schedules go with it; they are kept in the archive row).
  DELETE FROM public.channel_connections WHERE brand_id = p_brand_id;
  DELETE FROM public.brand_profiles WHERE id = p_brand_id;

  RETURN archive_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_brand(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_brand(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
