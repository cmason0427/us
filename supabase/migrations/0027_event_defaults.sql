-- Calendar "defaults": tap "Therapy" and the length, kind, place, notes and
-- reminder fill in; you only pick the day and start time. Shared: either of
-- you can add, change or remove any of them.
create table public.event_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  title text not null check (length(trim(title)) > 0),
  type public.event_type not null,
  all_day boolean not null default false,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  location text,
  notes text,
  reminder_lead_minutes integer,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index event_templates_name_idx on public.event_templates (lower(name));
alter table public.event_templates enable row level security;
create policy "event templates all" on public.event_templates for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.event_templates;
