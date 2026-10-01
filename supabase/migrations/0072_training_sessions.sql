-- Training sessions: a report card per session. Everything is optional except
-- the day, and the report card only shows what was filled in.
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  dog text not null default 'wiley',
  logged_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  minutes integer check (minutes > 0),
  place text,
  kinds text[] not null default '{}',        -- new skill, practice, free shaping…
  emojis text[] not null default '{}',       -- 1-3 picked to sum it up
  tags text[] not null default '{}',
  motivators text[] not null default '{}',   -- what was most motivating
  motivator_note text,
  succeeded text,
  struggled text,
  next_time text,
  success_pct integer check (success_pct between 0 and 100),   -- about how many reps went right
  focus integer check (focus between 1 and 5),
  client_proud text check (client_proud in ('yes', 'mostly', 'not_yet')),  -- would I be proud of a client dog for this?
  for_whom text check (for_whom in ('him', 'me', 'both')),
  for_whom_note text,
  milestone text,                            -- set = this session is a milestone
  notes text,
  created_at timestamptz not null default now()
);
create index training_sessions_dog_day on public.training_sessions (dog, day);

alter table public.training_sessions enable row level security;
create policy "training sessions all" on public.training_sessions for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.training_sessions;
