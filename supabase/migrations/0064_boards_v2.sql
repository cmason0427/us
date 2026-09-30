-- Boards, round two.
-- Stickers: frameless images (or a big emoji) placed on a board.
alter table public.thread_items drop constraint if exists thread_items_kind_check;
alter table public.thread_items add constraint thread_items_kind_check check (kind in ('note', 'sticky', 'photo', 'link', 'ink', 'sticker'));
alter table public.thread_items drop constraint if exists thread_items_has_something;
alter table public.thread_items add constraint thread_items_has_something
  check (kind in ('sticky', 'note') or coalesce(length(trim(text)), 0) > 0 or photo_path is not null or link is not null or ink is not null);
-- Text look (size, bold, font, color, align) and who hearted it.
alter table public.thread_items add column style jsonb;
alter table public.thread_items add column hearts uuid[] not null default '{}';

-- Saved stickers, shared by both of you, reusable on any board.
create table public.board_stickers (
  id uuid primary key default gen_random_uuid(),
  path text,
  emoji text,
  name text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (path is not null or emoji is not null)
);
alter table public.board_stickers enable row level security;
create policy "board stickers all" on public.board_stickers for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.board_stickers;
