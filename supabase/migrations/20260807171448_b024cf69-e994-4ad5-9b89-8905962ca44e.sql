CREATE TABLE public.content_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  week_start date not null,
  week_end date not null,
  metrics jsonb not null default '{}'::jsonb,
  insights text not null default '',
  directives text not null default '',
  rebuilt_dates text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

GRANT SELECT ON public.content_strategies TO authenticated;
GRANT ALL ON public.content_strategies TO service_role;

ALTER TABLE public.content_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own strategies"
ON public.content_strategies FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX content_strategies_user_week_idx ON public.content_strategies (user_id, week_start DESC);