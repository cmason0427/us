-- Fuel & move: walks (with or without the dogs) and walk goals, and past
-- entries can be edited (moved to another day, numbers fixed) by either of you.
alter table public.workout_logs drop constraint if exists workout_logs_kind_check;
alter table public.workout_logs add constraint workout_logs_kind_check check (kind in ('hike', 'walk', 'strength', 'cardio', 'other'));
alter table public.workout_logs add column if not exists dogs text[] not null default '{}';

alter table public.fit_profiles add column if not exists walk_minutes_goal integer check (walk_minutes_goal > 0);
alter table public.fit_profiles add column if not exists walk_miles_goal numeric(5, 2) check (walk_miles_goal > 0);
alter table public.fit_profiles add column if not exists walk_days_goal integer check (walk_days_goal between 1 and 7);

-- New entries still say who logged them; fixing one doesn't have to be yours.
drop policy if exists "food logs all" on public.food_logs;
drop policy if exists "workout logs all" on public.workout_logs;
drop policy if exists "weigh ins all" on public.weigh_ins;
create policy "food logs read" on public.food_logs for select to authenticated using (true);
create policy "food logs add" on public.food_logs for insert to authenticated with check (logged_by = auth.uid());
create policy "food logs fix" on public.food_logs for update to authenticated using (true) with check (true);
create policy "food logs remove" on public.food_logs for delete to authenticated using (true);
create policy "workout logs read" on public.workout_logs for select to authenticated using (true);
create policy "workout logs add" on public.workout_logs for insert to authenticated with check (logged_by = auth.uid());
create policy "workout logs fix" on public.workout_logs for update to authenticated using (true) with check (true);
create policy "workout logs remove" on public.workout_logs for delete to authenticated using (true);
create policy "weigh ins read" on public.weigh_ins for select to authenticated using (true);
create policy "weigh ins add" on public.weigh_ins for insert to authenticated with check (logged_by = auth.uid());
create policy "weigh ins fix" on public.weigh_ins for update to authenticated using (true) with check (true);
create policy "weigh ins remove" on public.weigh_ins for delete to authenticated using (true);
