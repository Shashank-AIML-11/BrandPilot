-- Brand media library: every photo or illustration made by fal is kept here so later
-- generations can reuse a matching one instead of paying for a new image.
create table if not exists public.brand_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid,
  kind text not null check (kind in ('photo', 'art')),
  aspect text not null default '1:1',
  storage_path text not null,
  prompt text,
  tags text[] not null default '{}',
  used_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists brand_media_lookup_idx
  on public.brand_media (user_id, brand_id, kind, aspect, last_used_at desc);

alter table public.brand_media enable row level security;
-- No policies: only the server (service role) reads or writes this table.
