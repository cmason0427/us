-- Any lunch message (a pick, preferences, a counter) can carry a note.
alter table public.lunch_msgs add column note text;
