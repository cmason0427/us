-- Money, day by day. Owner-only like every budget table.
-- A paycheck's normal daily rate, locked in when it lands, so leftovers from
-- earlier days pile onto the next day instead of being re-spread.
create table public.budget_rates (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_start date not null,
  rate numeric(10, 2) not null check (rate >= 0),
  primary key (owner, period_start)
);
-- "Move $20 from Tuesday to Saturday."
create table public.budget_moves (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_day date not null,
  to_day date not null,
  amount numeric(10, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
-- "Didn't spend anything today" (a ✓ on the day; the money rolls on by itself).
create table public.budget_day_marks (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  primary key (owner, day)
);
alter table public.budget_rates enable row level security;
alter table public.budget_moves enable row level security;
alter table public.budget_day_marks enable row level security;
create policy "budget_rates own" on public.budget_rates for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "budget_moves own" on public.budget_moves for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "budget_day_marks own" on public.budget_day_marks for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
alter publication supabase_realtime add table public.budget_rates, public.budget_moves, public.budget_day_marks;

-- Spicy videos: long ones are stored in pieces (each under the 50 MB file cap)
-- with a still for the grid.
alter table public.spicy_media add column parts integer not null default 1 check (parts between 1 and 20);
alter table public.spicy_media add column poster_path text;
alter table public.spicy_media add column duration numeric(8, 2);
