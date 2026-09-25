-- A surprise meal: the other person only learns something's planned. Any
-- pick attached is just for whoever planned it (the app never shows it to
-- the other person or puts it in the push).
alter table public.lunch_msgs drop constraint if exists lunch_msgs_kind_check;
alter table public.lunch_msgs add constraint lunch_msgs_kind_check check (kind in ('propose', 'filters', 'request', 'options', 'decided', 'surprise'));
