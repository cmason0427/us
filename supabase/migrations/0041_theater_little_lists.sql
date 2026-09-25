-- Rooms are out: hobbies are fixed tabs in code (see src/app/(app)/nerd/page.tsx).
drop table if exists public.nerd_rooms cascade;

-- Little things: each section is a list you add to one at a time, with an
-- optional longer note. `section` groups it; `label` is its little heading.
alter table public.little_things add column section text;
alter table public.little_things add column note text;
update public.little_things set section = case
  when label in ('field:shirt','field:pants','field:shoes','field:ring','field:hat','field:jacket','field:other_size') then 'sizes'
  when label in ('field:color','field:flower','field:snack','field:candy','field:drink','field:coffee','field:takeout','field:scent','field:watch','field:music') then 'favorites'
  when label like 'field:%' then 'prefs'
  else 'misc' end
where kind = 'fact' and section is null;

-- ─── The theater: what we want to watch ─────────────────────────────────
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  kind text not null default 'movie' check (kind in ('movie', 'show')),
  tags text[] not null default '{}',
  notes text,
  watched_at timestamptz,
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.watchlist enable row level security;
create policy "watchlist all" on public.watchlist for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.watchlist;
