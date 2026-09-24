-- Dogs live in the feed and in Ours; activities know if they're in or out.

-- ─── Dog notes are posts ─────────────────────────────────────────────────────
-- A post tagged with one or more dogs (ids from src/lib/dogs.ts) is a dog note:
-- it shows in the feed like any update and in the Dogs tab.
alter table public.posts add column dogs text[] not null default '{}';

-- Carry the old dog log over. Potty entries become short notes.
insert into public.posts (author, text, dogs, created_at)
select
  created_by,
  case
    when type = 'note' then detail
    when potty_kind = 'pee' then 'Pee'
    when potty_kind = 'poop' then 'Poop'
    else 'Pee + poop'
  end,
  array[dog],
  occurred_at
from public.kodo_logs;
-- kodo_logs is kept (unused) as a backup of the original entries.

-- ─── Dog to-dos ──────────────────────────────────────────────────────────────
-- A list of their own that also shows in Ours, like household.
alter type public.list_type add value if not exists 'dogs';

-- ─── Activities: at home or out ──────────────────────────────────────────────
-- null = works either way.
alter table public.activities add column setting text check (setting in ('home', 'out'));
