-- Admin on/off switches, read live by the server on every run (no redeploy needed).
-- Each Supabase project (staging, production) has its own copy, so each environment
-- is controlled separately from its own Admin Portal.
create table if not exists public.app_settings (
  key text primary key,
  value boolean not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.app_settings enable row level security;
-- No policies on purpose: only the server (service role) reads or writes this table.

-- Automatic content generation starts OFF (this is what stops it now).
-- Automatic posting stays ON, as it works today.
insert into public.app_settings (key, value) values
  ('auto_generate_enabled', false),
  ('autopost_enabled', true)
on conflict (key) do nothing;
