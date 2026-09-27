-- "Saturday gets $30": a set amount for one day. The paycheck's total stays
-- the same; days without one share what's left evenly. Owner-only.
create table public.budget_day_amounts (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  amount numeric(10, 2) not null check (amount >= 0),
  primary key (owner, day)
);
alter table public.budget_day_amounts enable row level security;
create policy "budget_day_amounts own" on public.budget_day_amounts for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
alter publication supabase_realtime add table public.budget_day_amounts;
