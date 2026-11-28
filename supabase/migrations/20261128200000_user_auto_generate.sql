-- Per-account Auto-Generate switch (sidebar). OFF by default.
-- The Admin Portal > Automation switch overrides it: if admin has it OFF, nothing auto-generates.
alter table public.profiles add column if not exists auto_generate_enabled boolean not null default false;
