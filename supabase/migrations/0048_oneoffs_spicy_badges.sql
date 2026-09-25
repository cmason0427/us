-- Budget: one-off money in (a bonus, a sale) or a surprise bill.
create table public.budget_oneoffs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  name text not null,
  amount numeric(10, 2) not null check (amount > 0),
  on_date date not null,
  created_at timestamptz not null default now()
);
alter table public.budget_oneoffs enable row level security;
create policy "budget_oneoffs own" on public.budget_oneoffs for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
