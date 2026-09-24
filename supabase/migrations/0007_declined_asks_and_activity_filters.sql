-- Declined asks stay the asker's; activities get optional cost and length.

-- ─── Asks: locked until accepted ─────────────────────────────────────────────
-- Pending or declined, an ask is the asker's plan. The other person can answer
-- it, and on a declined one can still add or change their note / suggestion.
create or replace function public.guard_pending_ask()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null  -- server jobs (reminders) run as the service role
     or old.created_by = auth.uid()
     or old.type <> 'ask'
     or old.response_status not in ('pending', 'declined') then
    return new;
  end if;
  if old.response_status = 'declined' and new.response_status is distinct from old.response_status then
    raise exception 'That plan is theirs now. You can leave a note on it.' using errcode = '42501';
  end if;
  if (new.title, new.type, new.start_time, new.end_time, new.all_day, new.notes, new.location,
      new.reminder_lead_minutes, new.created_by)
     is distinct from
     (old.title, old.type, old.start_time, old.end_time, old.all_day, old.notes, old.location,
      old.reminder_lead_minutes, old.created_by) then
    raise exception 'Only the person who asked can change this plan.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop policy "events delete" on public.events;
create policy "events delete" on public.events for delete to authenticated
  using (created_by = auth.uid() or not (type = 'ask' and response_status in ('pending', 'declined')));

-- ─── Activities: optional cost and length ────────────────────────────────────
-- null = not set; unset ideas pass every filter.
alter table public.activities
  add column cost text check (cost in ('free', 'cheap', 'splurge')),
  add column duration text check (duration in ('quick', 'few_hours', 'all_day'));
