-- A meal can have a set time ("dinner at 7"); then it shows on the calendar.
create table public.meal_times (
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  at time not null,
  set_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (day, meal)
);
alter table public.meal_times enable row level security;
create policy "meal times all" on public.meal_times for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.meal_times;
