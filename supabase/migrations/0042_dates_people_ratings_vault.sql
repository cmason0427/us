-- Yearly repeats (birthdays, anniversaries) on the calendar.
alter table public.event_series drop constraint if exists event_series_freq_check;
alter table public.event_series add constraint event_series_freq_check
  check (freq in ('weekly', 'biweekly', 'monthly_date', 'monthly_weekday', 'yearly'));

-- A profile fact can own a yearly calendar series (a birthday).
alter table public.little_things add column series_id uuid references public.event_series (id) on delete set null;

-- Shared: our dates (anniversaries, first date…) with a little note thread each.
create table public.us_dates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  emoji text,
  on_date date not null,
  yearly boolean not null default true,
  note text,
  series_id uuid references public.event_series (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.us_date_notes (
  id uuid primary key default gen_random_uuid(),
  date_id uuid not null references public.us_dates (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);
-- Shared: important people and how to reach them.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  relation text,
  phone text,
  email text,
  address text,
  birthday date,
  notes text,
  series_id uuid references public.event_series (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.us_dates enable row level security;
alter table public.us_date_notes enable row level security;
alter table public.people enable row level security;
create policy "us dates all" on public.us_dates for all to authenticated using (true) with check (true);
create policy "us date notes read" on public.us_date_notes for select to authenticated using (true);
create policy "us date notes insert" on public.us_date_notes for insert to authenticated with check (author = auth.uid());
create policy "us date notes delete" on public.us_date_notes for delete to authenticated using (author = auth.uid());
create policy "people all" on public.people for all to authenticated using (true) with check (true);

-- Food: each of you scores a place or meal 1-10.
create table public.food_ratings (
  kind text not null check (kind in ('place', 'meal')),
  ref_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score integer not null check (score between 1 and 10),
  note text,
  updated_at timestamptz not null default now(),
  primary key (kind, ref_id, user_id)
);
alter table public.food_ratings enable row level security;
create policy "food ratings read" on public.food_ratings for select to authenticated using (true);
create policy "food ratings write" on public.food_ratings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lunch tracker: what got made and taken, and how it went over.
create table public.lunch_log (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  made_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  for_user uuid references auth.users (id) on delete set null,
  what text not null check (length(trim(what)) > 0),
  meal_id uuid references public.home_meals (id) on delete set null,
  verdict text check (verdict in ('loved', 'liked', 'meh', 'no')),
  verdict_note text,
  created_at timestamptz not null default now()
);
create index lunch_log_day_idx on public.lunch_log (day desc);
alter table public.lunch_log enable row level security;
create policy "lunch log all" on public.lunch_log for all to authenticated using (true) with check (true);

-- Garden: terpenes, and flavor as its own rating.
alter table public.garden_items add column terps text[] not null default '{}';
alter table public.garden_reviews add column flavor integer check (flavor between 1 and 5);

-- Keys: each person's own logins. Both can see the NAMES (to ask for one);
-- the secret is encrypted by the server and never readable from the browser.
create table public.vault_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'app' check (kind in ('app', 'device', 'card', 'other')),
  secret_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vault_items_name_idx on public.vault_items (owner, lower(trim(name)));
-- One-time shares: asked for, then sent; the payload is wiped once it's seen.
create table public.vault_shares (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.vault_items (id) on delete cascade,
  item_name text not null,
  owner uuid not null references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('requested', 'sent', 'declined', 'seen')),
  payload_enc text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.vault_items enable row level security;
alter table public.vault_shares enable row level security;
create policy "vault items read" on public.vault_items for select to authenticated using (true);
create policy "vault shares read" on public.vault_shares for select to authenticated using (auth.uid() in (owner, recipient));
-- All writes go through the server (it encrypts); the ciphertext isn't selectable at all.
revoke all on public.vault_items, public.vault_shares from anon, authenticated;
grant select (id, owner, name, kind, created_at, updated_at) on public.vault_items to authenticated;
grant select (id, item_id, item_name, owner, recipient, status, created_at, resolved_at) on public.vault_shares to authenticated;

alter publication supabase_realtime add table public.us_dates, public.us_date_notes, public.people, public.food_ratings, public.lunch_log;
