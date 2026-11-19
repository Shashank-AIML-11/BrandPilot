-- "Refresh Calendar" now hides a week from the calendar without deleting the content,
-- so it stays in the database and in the Content Library.
alter table public.content_items
  add column if not exists calendar_hidden boolean not null default false;
