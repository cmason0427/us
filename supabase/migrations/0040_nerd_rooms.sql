-- Nerd dungeon rooms: MTG decks are the built-in room (room_id null); any
-- other hobby (D&D characters, board games, minis…) is a room you make, with
-- the same shelves, covers, tags, wishlist and an optional 1–10 meter.
create table public.nerd_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  emoji text,
  item_word text not null default 'item',        -- "character", "game"…
  meter_label text,                              -- "Level", "How much we love it"… (null = no meter)
  subtitle_label text,                           -- "Class", "Publisher"… (null = none)
  position integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.nerd_rooms enable row level security;
create policy "rooms all" on public.nerd_rooms for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.nerd_rooms;

alter table public.decks add column room_id uuid references public.nerd_rooms (id) on delete cascade;
alter table public.nerd_shelves add column room_id uuid references public.nerd_rooms (id) on delete cascade;
