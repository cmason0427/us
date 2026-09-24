-- To-do deadlines, and asks that talk in the feed.

-- ─── Deadlines ───────────────────────────────────────────────────────────────
-- due_at is the moment it's due. "By end of day" deadlines store the end of that
-- local day with due_all_day = true (shown as a day, not a time). Once due_at
-- passes on an open task, the reminders cron bumps it to high urgency.
alter table public.tasks
  add column due_at timestamptz,
  add column due_all_day boolean not null default false;
create index tasks_overdue_idx on public.tasks (due_at) where not done and due_at is not null;

-- ─── Asks: decline notes and counter-proposals ───────────────────────────────
alter table public.events
  add column decline_note text,
  add column proposed_start timestamptz;

-- ─── Feed posts about calendar events ────────────────────────────────────────
-- Ask sent / answered / moved each drop a post in the feed linking to the event.
-- The text stands alone, so the post survives the event being deleted.
alter table public.posts add column event_id uuid references public.events (id) on delete set null;
