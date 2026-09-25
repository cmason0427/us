-- ─── Nerd dungeon: MTG decks on shelves (D&D and friends can move in later) ──
create table public.nerd_shelves (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  evil integer not null default 5 check (evil between 1 and 10),
  color text,
  cover_path text,
  tags text[] not null default '{}',
  shelf_id uuid references public.nerd_shelves (id) on delete set null,
  position integer not null default 0,
  commander text,
  notes text,
  created_at timestamptz not null default now()
);
-- Cards you're hunting for, per deck.
create table public.deck_chase (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  card text not null check (length(trim(card)) > 0),
  got boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
-- "Which deck are you bringing?" (or just "I'm bringing X").
create table public.deck_calls (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  my_deck uuid references public.decks (id) on delete set null,
  their_deck uuid references public.decks (id) on delete set null,
  asking boolean not null default true,
  note text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.nerd_shelves enable row level security;
alter table public.decks enable row level security;
alter table public.deck_chase enable row level security;
alter table public.deck_calls enable row level security;
-- Everything's visible to both; either of you can shuffle shelves, but a
-- deck's details are its owner's to change (moving it on a shelf is fine too).
create policy "shelves all" on public.nerd_shelves for all to authenticated using (true) with check (true);
create policy "decks read" on public.decks for select to authenticated using (true);
create policy "decks insert" on public.decks for insert to authenticated with check (owner = auth.uid());
create policy "decks update" on public.decks for update to authenticated using (true) with check (true);
create policy "decks delete" on public.decks for delete to authenticated using (owner = auth.uid());
create policy "chase all" on public.deck_chase for all to authenticated using (true) with check (true);
create policy "calls read" on public.deck_calls for select to authenticated using (true);
create policy "calls insert" on public.deck_calls for insert to authenticated with check (from_user = auth.uid());
create policy "calls answer" on public.deck_calls for update to authenticated using (to_user = auth.uid() or from_user = auth.uid()) with check (true);
alter publication supabase_realtime add table public.nerd_shelves, public.decks, public.deck_chase, public.deck_calls;

-- ─── Garden: what we bought and how it was ───────────────────────────────
create table public.garden_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text check (kind in ('flower', 'preroll', 'vape', 'edible', 'concentrate', 'tincture', 'other')),
  strain text,
  strain_type text check (strain_type in ('indica', 'sativa', 'hybrid', 'cbd')),
  brand text,
  shop text,
  price numeric(8, 2),
  amount text,
  thc text,
  bought_on date,
  bought_by uuid references auth.users (id) on delete set null default auth.uid(),
  notes text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Each of you rates it your own way.
create table public.garden_reviews (
  item_id uuid not null references public.garden_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  high integer check (high between 1 and 5),
  worth text check (worth in ('yes', 'meh', 'no')),
  effects text[] not null default '{}',
  note text,
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table public.garden_items enable row level security;
alter table public.garden_reviews enable row level security;
create policy "garden items all" on public.garden_items for all to authenticated using (true) with check (true);
create policy "garden reviews read" on public.garden_reviews for select to authenticated using (true);
create policy "garden reviews write" on public.garden_reviews for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.garden_items, public.garden_reviews;
