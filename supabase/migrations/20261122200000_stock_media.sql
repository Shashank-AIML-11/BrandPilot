-- Stock footage: the media library also keeps B-roll clips fetched from Pixabay (per brand).
alter table public.brand_media drop constraint if exists brand_media_kind_check;
alter table public.brand_media
  add constraint brand_media_kind_check check (kind in ('photo', 'art', 'video', 'broll'));
alter table public.brand_media add column if not exists source text;
alter table public.brand_media add column if not exists source_url text;
alter table public.brand_media add column if not exists author text;
alter table public.brand_media add column if not exists duration_s numeric;
