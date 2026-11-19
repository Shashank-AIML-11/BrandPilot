-- Audit trail: every time a user accepts (or later withdraws) the Autopost notice.
-- Safe to run whether or not an earlier version of this table was created.
create table if not exists public.autopost_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('accepted', 'turned_off')),
  consent_text text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.autopost_consents add column if not exists ip_address text;
alter table public.autopost_consents add column if not exists plan text;
alter table public.autopost_consents add column if not exists plan_status text;

create index if not exists autopost_consents_user_idx
  on public.autopost_consents (user_id, created_at desc);

alter table public.autopost_consents enable row level security;

drop policy if exists "Users read own autopost consents" on public.autopost_consents;
create policy "Users read own autopost consents"
  on public.autopost_consents for select
  using (auth.uid() = user_id);

-- Rows are written only by the server (it records the real IP and plan), never by the browser.
drop policy if exists "Users add own autopost consents" on public.autopost_consents;
-- No insert/update/delete policies: records are append-only.
