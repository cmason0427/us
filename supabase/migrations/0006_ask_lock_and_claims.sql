-- Pending asks belong to the asker; to-dos can be claimed.

-- ─── Pending asks: only the asker edits ──────────────────────────────────────
-- While an ask is waiting on an answer, the other person can only answer it
-- (accept, or decline with a note and a suggested time). Everything else about
-- it, including deleting it, is the asker's.
create function public.guard_pending_ask()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null  -- server jobs (reminders) run as the service role
     or old.created_by = auth.uid()
     or old.type <> 'ask'
     or old.response_status is distinct from 'pending' then
    return new;
  end if;
  if (new.title, new.type, new.start_time, new.end_time, new.all_day, new.notes, new.location,
      new.reminder_lead_minutes, new.created_by)
     is distinct from
     (old.title, old.type, old.start_time, old.end_time, old.all_day, old.notes, old.location,
      old.reminder_lead_minutes, old.created_by) then
    raise exception 'Only the person who asked can change this until it''s answered.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_guard_pending_ask before update on public.events
  for each row execute function public.guard_pending_ask();

drop policy "events delete" on public.events;
create policy "events delete" on public.events for delete to authenticated
  using (created_by = auth.uid() or not (type = 'ask' and response_status = 'pending'));

-- ─── Claiming to-dos ─────────────────────────────────────────────────────────
-- "I'll do it": who's planning to take care of a shared to-do.
alter table public.tasks add column claimed_by uuid references auth.users (id) on delete set null;
