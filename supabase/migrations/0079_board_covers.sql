-- Boards tab: each board has a cover picture. "auto" keeps it updated to the
-- whole board as things change; otherwise it's a view someone picked.
alter table public.threads add column if not exists cover_path text;
alter table public.threads add column if not exists cover_auto boolean not null default true;
alter table public.threads add column if not exists cover_at timestamptz;
