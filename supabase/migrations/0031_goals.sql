-- Savings goals ("things we wanna budget for"). Private ones are yours alone
-- (enforced here, not just hidden). Shared ones only track money if that
-- goal was set up to; otherwise they're just the plan.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  emoji text,
  shared boolean not null default false,
  -- Private goals: the one person who can see it.
  owner uuid references auth.users (id) on delete cascade,
  -- 'plan': add up line items · 'total': one amount · 'habit': add $X every so often, no target
  mode text not null default 'plan' check (mode in ('plan', 'total', 'habit')),
  target_amount numeric(12, 2),          -- 'total' mode
  habit_amount numeric(12, 2),           -- 'habit' mode: how much each check-in
  -- When: nothing, a date, or a range (days from start_date).
  when_kind text not null default 'none' check (when_kind in ('none', 'date', 'range')),
  target_date date,
  range_from_days integer,
  range_to_days integer,
  -- Proposing a budget: suggest how much per week/month and ask at each one.
  propose boolean not null default true,
  -- Check-in spacing in days (7 = weekly, 30 = monthly…); null = picked from the timeline.
  checkin_days integer check (checkin_days is null or checkin_days between 1 and 366),
  start_date date not null default current_date,
  track boolean not null default true,
  archived_at timestamptz,
  notes text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shared or owner is not null)
);

create table public.goal_items (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  amount numeric(12, 2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- The savings log: money in, money out, or "the account is at $X now".
create table public.goal_logs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  kind text not null check (kind in ('add', 'withdraw', 'balance', 'skip')),
  amount numeric(12, 2) not null default 0,
  -- Which check-in this answers (the due date), if any.
  checkin_for date,
  note text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index goal_logs_goal_idx on public.goal_logs (goal_id, created_at);

create or replace function public.can_see_goal(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from goals where id = g and (shared or owner = auth.uid()));
$$;

alter table public.goals enable row level security;
alter table public.goal_items enable row level security;
alter table public.goal_logs enable row level security;

create policy "goals read" on public.goals for select to authenticated using (shared or owner = auth.uid());
create policy "goals insert" on public.goals for insert to authenticated
  with check (created_by = auth.uid() and (shared and owner is null or owner = auth.uid()));
create policy "goals update" on public.goals for update to authenticated
  using (shared or owner = auth.uid()) with check (shared and owner is null or owner = auth.uid());
create policy "goals delete" on public.goals for delete to authenticated using (shared or owner = auth.uid());

create policy "goal items all" on public.goal_items for all to authenticated
  using (public.can_see_goal(goal_id)) with check (public.can_see_goal(goal_id));
-- Money on a shared goal is only logged when that goal tracks it.
create policy "goal logs read" on public.goal_logs for select to authenticated using (public.can_see_goal(goal_id));
create policy "goal logs insert" on public.goal_logs for insert to authenticated
  with check (created_by = auth.uid() and public.can_see_goal(goal_id)
              and exists (select 1 from goals where id = goal_id and track));
create policy "goal logs delete" on public.goal_logs for delete to authenticated
  using (created_by = auth.uid() and public.can_see_goal(goal_id));

alter publication supabase_realtime add table public.goals, public.goal_items, public.goal_logs;
