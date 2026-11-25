-- Brand Brain: one stored playbook per brand + a record of the style used by each content item
-- (pillar, hook style, template) so the variety planner can avoid repeating itself.

CREATE TABLE IF NOT EXISTS public.brand_playbooks (
  brand_id uuid PRIMARY KEY REFERENCES public.brand_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- brand_profiles.updated_at the playbook was built from; a newer profile triggers a rebuild
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_playbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own playbooks" ON public.brand_playbooks;
CREATE POLICY "Users read own playbooks" ON public.brand_playbooks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS style_meta jsonb;

CREATE INDEX IF NOT EXISTS content_items_brand_style_idx
  ON public.content_items (brand_id, scheduled_date DESC)
  WHERE style_meta IS NOT NULL;

NOTIFY pgrst, 'reload schema';
