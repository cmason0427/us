-- Boards: a photo grid tile (its own layout of slots, each holding a picture).
alter table public.thread_items add column photos text[] not null default '{}';
alter table public.thread_items drop constraint if exists thread_items_kind_check;
alter table public.thread_items add constraint thread_items_kind_check check (kind in ('note', 'sticky', 'photo', 'link', 'ink', 'sticker', 'grid'));
alter table public.thread_items drop constraint if exists thread_items_has_something;
alter table public.thread_items add constraint thread_items_has_something
  check (kind in ('sticky', 'note', 'grid') or coalesce(length(trim(text)), 0) > 0 or photo_path is not null or link is not null or ink is not null);
