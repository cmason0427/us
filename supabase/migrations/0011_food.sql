-- Eat: places to go, meals to make, and a shared pantry.
-- All options are optional (null / empty = not set, passes every filter).

create table public.food_places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  price text check (price in ('1', '2', '3')),                 -- $, $$, $$$
  cuisines text[] not null default '{}',                        -- ids from src/lib/food.ts
  distance text check (distance in ('close', 'medium', 'far')),
  service text[] not null default '{}',                         -- drive_thru, sit_down, takeout, delivery
  meals text[] not null default '{}',                           -- breakfast, lunch, dinner, late
  notes text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.home_meals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  safe boolean,                                                 -- a "safe food"
  fancy boolean,
  method text check (method in ('no_cook', 'microwave', 'stovetop', 'oven', 'air_fryer')),
  size text check (size in ('snack', 'meal')),
  time text check (time in ('quick', 'medium', 'long')),
  notes text,                                                   -- recipe / how-to
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.home_meals (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0
);
create index meal_ingredients_meal_idx on public.meal_ingredients (meal_id);

-- One shared "do we have it?" per ingredient name (lowercased), across all meals.
create table public.pantry (
  name text primary key check (name = lower(trim(name)) and length(name) > 0),
  have boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.food_places enable row level security;
alter table public.home_meals enable row level security;
alter table public.meal_ingredients enable row level security;
alter table public.pantry enable row level security;

create policy "places all" on public.food_places for all to authenticated using (true) with check (true);
create policy "meals all" on public.home_meals for all to authenticated using (true) with check (true);
create policy "ingredients all" on public.meal_ingredients for all to authenticated using (true) with check (true);
create policy "pantry all" on public.pantry for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.food_places, public.home_meals, public.meal_ingredients, public.pantry;
