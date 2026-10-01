-- Water: a daily goal per person, quick logs, an optional row on Home.
-- Amounts are stored in ml; each person picks oz or ml for display.
create table public.water_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal_ml integer not null default 1893 check (goal_ml > 0),   -- 64 oz
  unit text not null default 'oz' check (unit in ('oz', 'ml')),
  sizes_ml jsonb not null default '[237, 355, 473, 710]',      -- 8 / 12 / 16 / 24 oz quick buttons
  on_home boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  ml integer not null check (ml > 0),
  created_at timestamptz not null default now()
);
create index water_logs_user_day on public.water_logs (user_id, day);

-- Pup parenting: rules to check yourself on, e-collar use, quiet notes, and a
-- training map (concepts as a tree/web with labelled connections).
create table public.pup_rules (
  id uuid primary key default gen_random_uuid(),
  dog text not null default 'wiley',
  title text not null,
  origin text,          -- where it came from / why it started
  concern text,         -- the safety concern it protects against
  still_needed text not null default 'yes' check (still_needed in ('yes', 'unsure', 'no')),
  strictness integer not null default 3 check (strictness between 1 and 5),
  gentler text,         -- a softer way to cover the same concern
  reviewed_at timestamptz,
  retired boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.collar_logs (
  id uuid primary key default gen_random_uuid(),
  dog text not null default 'wiley',
  logged_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  used boolean not null,                       -- did the collar get used this outing/session?
  levels integer[] not null default '{}',      -- button numbers used, 1-100
  context text,
  created_at timestamptz not null default now(),
  check (1 <= all (levels) and 100 >= all (levels))
);
create index collar_logs_dog_day on public.collar_logs (dog, day);

create table public.pup_notes (
  id uuid primary key default gen_random_uuid(),
  dog text not null default 'wiley',
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.training_nodes (
  id uuid primary key default gen_random_uuid(),
  dog text not null default 'wiley',
  parent_id uuid references public.training_nodes (id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'trying' check (status in ('idea', 'trying', 'working', 'not_working', 'mastered')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.training_links (
  id uuid primary key default gen_random_uuid(),
  dog text not null default 'wiley',
  from_id uuid not null references public.training_nodes (id) on delete cascade,
  to_id uuid not null references public.training_nodes (id) on delete cascade,
  label text,
  arrow text not null default 'forward' check (arrow in ('none', 'forward', 'both')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);

-- Each person's own sidebar: order, custom categories, pins. Only theirs.
create table public.nav_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  layout jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.water_settings enable row level security;
alter table public.water_logs enable row level security;
alter table public.pup_rules enable row level security;
alter table public.collar_logs enable row level security;
alter table public.pup_notes enable row level security;
alter table public.training_nodes enable row level security;
alter table public.training_links enable row level security;
alter table public.nav_prefs enable row level security;
create policy "water settings all" on public.water_settings for all to authenticated using (true) with check (true);
create policy "water logs all" on public.water_logs for all to authenticated using (true) with check (logged_by = auth.uid());
create policy "pup rules all" on public.pup_rules for all to authenticated using (true) with check (true);
create policy "collar logs all" on public.collar_logs for all to authenticated using (true) with check (logged_by = auth.uid());
create policy "pup notes all" on public.pup_notes for all to authenticated using (true) with check (author = auth.uid());
create policy "training nodes all" on public.training_nodes for all to authenticated using (true) with check (true);
create policy "training links all" on public.training_links for all to authenticated using (true) with check (true);
create policy "nav prefs own" on public.nav_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.water_settings, public.water_logs, public.pup_rules, public.collar_logs, public.pup_notes, public.training_nodes, public.training_links, public.nav_prefs;

insert into public.water_settings (user_id) select id from public.profiles on conflict (user_id) do nothing;
