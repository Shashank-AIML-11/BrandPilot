-- Daily spend guard: one row per paid media call (fal image, Shotstack render).
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_kind_day_idx on public.ai_usage (kind, created_at desc);
alter table public.ai_usage enable row level security;
-- No policies: only the server (service role) reads or writes this table.
