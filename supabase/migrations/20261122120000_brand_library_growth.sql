-- Library growth: the media library also keeps finished videos, and every explainer script is stored.
alter table public.brand_media drop constraint if exists brand_media_kind_check;
alter table public.brand_media
  add constraint brand_media_kind_check check (kind in ('photo', 'art', 'video'));

create unique index if not exists brand_media_storage_path_uidx on public.brand_media (storage_path);

create table if not exists public.brand_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid,
  content_item_id uuid,
  hook text,
  layouts text[] not null default '{}',
  scenes jsonb not null default '[]',
  total_words integer,
  est_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists brand_scripts_brand_idx on public.brand_scripts (user_id, brand_id, created_at desc);
alter table public.brand_scripts enable row level security;
-- No policies: only the server (service role) reads or writes this table.
