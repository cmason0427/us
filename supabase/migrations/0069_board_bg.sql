-- A board's background color (null = the default paper).
alter table public.threads add column if not exists bg text;
