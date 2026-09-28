-- Theater: whose pick it is (null = either of us).
alter table public.watchlist add column whose uuid references auth.users (id) on delete set null;

-- Calendar pins: a small tag at a time on a day, for anything ("🎳 bowling at
-- 7"), optionally from one of our activity ideas. Shared, like plans.
create table public.cal_pins (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  at time not null,
  title text not null check (length(trim(title)) > 0),
  emoji text,
  activity_id uuid references public.activities (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index cal_pins_day_idx on public.cal_pins (day);
alter table public.cal_pins enable row level security;
create policy "cal pins all" on public.cal_pins for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.cal_pins;

-- A to-do with a set time can show on the calendar as a pin. It reads the
-- to-do itself (so private ones stay private through the tasks policy).
alter table public.tasks add column on_calendar boolean not null default false;

-- "Can you do this?": ask the other person to take a to-do or a checklist item.
alter table public.tasks add column asked_for uuid references auth.users (id) on delete set null;
alter table public.task_items add column asked_for uuid references auth.users (id) on delete set null;
alter table public.task_items add column claimed_by uuid references auth.users (id) on delete set null;
