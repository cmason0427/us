-- A time window on to-dos ("between 7 and 10 am"): the deadline is the end of
-- the window, and window_start says when it opens. Presets carry the window.
alter table public.tasks add column window_start time;
alter table public.task_templates add column window_start time;
alter table public.task_templates add column window_end time;
