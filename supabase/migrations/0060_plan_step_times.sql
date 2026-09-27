-- A time block's steps can each have an optional set time ("dinner at 6:30").
alter table public.day_plan_items add column at_time time;
