-- Support/Help contact form submissions. This table was originally
-- created ad-hoc via the SQL Editor and never saved as a migration —
-- this file documents it retroactively so fresh environments and
-- future rebuilds stay in sync with what's actually live in Supabase.
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_user_id_idx ON public.support_messages (user_id);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_messages_insert_own ON public.support_messages;
CREATE POLICY support_messages_insert_own ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS support_messages_select_own ON public.support_messages;
CREATE POLICY support_messages_select_own ON public.support_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());