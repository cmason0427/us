-- Fuel & move: weight gain + workout tracking, set up differently per person
-- (Charlie: "did I eat" + daily hikes; Parker: calories, protein, reps).
-- Either of you can log for the other (e.g. the lunch you made him), and
-- every row says who logged it. Keep them plain, dated, per person.

create table public.fit_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  style text not null default 'simple' check (style in ('simple', 'detailed')),
  kcal_goal integer check (kcal_goal > 0),
  protein_goal integer check (protein_goal > 0),
  start_weight numeric(6, 1),
  goal_weight numeric(6, 1),
  goal_date date,
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  -- Detailed style: daily rep goals, e.g. [{"name":"push-ups","reps":60}]
  rep_goals jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,   -- whose intake
  logged_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  meal text check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text,
  kcal integer check (kcal >= 0),
  protein numeric(6, 1) check (protein >= 0),
  home_meal_id uuid references public.home_meals (id) on delete set null,
  servings numeric(5, 2) not null default 1,
  created_at timestamptz not null default now()
);
create index food_logs_user_day on public.food_logs (user_id, day);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  kind text not null default 'strength' check (kind in ('hike', 'strength', 'cardio', 'other')),
  name text,
  sets integer check (sets > 0),
  reps integer check (reps > 0),
  weight numeric(6, 1),
  minutes integer check (minutes > 0),
  distance numeric(6, 2),
  notes text,
  created_at timestamptz not null default now()
);
create index workout_logs_user_day on public.workout_logs (user_id, day);

create table public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  weight numeric(6, 1) not null check (weight > 0),
  created_at timestamptz not null default now()
);
create index weigh_ins_user_day on public.weigh_ins (user_id, day);

-- Saved meals can carry per-serving numbers so logging them fills in.
alter table public.home_meals add column if not exists kcal integer check (kcal >= 0);
alter table public.home_meals add column if not exists protein numeric(6, 1) check (protein >= 0);

alter table public.fit_profiles enable row level security;
alter table public.food_logs enable row level security;
alter table public.workout_logs enable row level security;
alter table public.weigh_ins enable row level security;
create policy "fit profiles all" on public.fit_profiles for all to authenticated using (true) with check (true);
create policy "food logs all" on public.food_logs for all to authenticated using (true) with check (logged_by = auth.uid());
create policy "workout logs all" on public.workout_logs for all to authenticated using (true) with check (logged_by = auth.uid());
create policy "weigh ins all" on public.weigh_ins for all to authenticated using (true) with check (logged_by = auth.uid());
alter publication supabase_realtime add table public.fit_profiles, public.food_logs, public.workout_logs, public.weigh_ins;

-- Starting styles: Charlie simple, Parker detailed (either can switch).
insert into public.fit_profiles (user_id, style)
select id, case when lower(display_name) like 'parker%' then 'detailed' else 'simple' end from public.profiles
on conflict (user_id) do nothing;
