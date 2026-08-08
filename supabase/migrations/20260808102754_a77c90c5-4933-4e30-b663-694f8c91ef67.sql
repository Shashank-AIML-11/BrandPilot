CREATE TABLE public.channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  account_id text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT '',
  refresh_token text NOT NULL DEFAULT '',
  token_expires_at timestamptz,
  scopes text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'connected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);

-- Tokens must never reach the browser: only the trusted server role can read this table.
GRANT ALL ON public.channel_connections TO service_role;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER t_channel_connections_updated
BEFORE UPDATE ON public.channel_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.publish_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_item_id uuid REFERENCES public.content_items(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  external_id text NOT NULL DEFAULT '',
  external_url text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.publish_log TO authenticated;
GRANT ALL ON public.publish_log TO service_role;
ALTER TABLE public.publish_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY publish_log_select_own ON public.publish_log
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY publish_log_admin_read ON public.publish_log
FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

CREATE INDEX idx_publish_log_item ON public.publish_log (content_item_id);
CREATE INDEX idx_publish_log_user_created ON public.publish_log (user_id, created_at DESC);

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS autopost boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_channels text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_content_items_due
  ON public.content_items (status, scheduled_date, scheduled_time);