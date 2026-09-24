-- Lunch today: where (home / Parker's work / out) and the back-and-forth.

create table public.lunch_days (
  day date primary key,                       -- the phone's local date
  place text check (place in ('home', 'work', 'out')),
  set_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- One thread per day. The latest message says what's being waited on.
--   propose  refs[0]  "how about this?"      → accept / counter (propose) / filters
--   filters  filters  "here's what I'm feeling" → pick from matches (decided) / filters back
--   request  filters.mode  "send me options"   → options
--   options  refs     "pick one of these"     → pick (decided)
--   decided  refs[0]  settled
-- refs: [{ "kind": "place" | "meal", "id": uuid }]
create table public.lunch_msgs (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('propose', 'filters', 'request', 'options', 'decided')),
  refs jsonb not null default '[]',
  filters jsonb,
  created_at timestamptz not null default now()
);
create index lunch_msgs_day_idx on public.lunch_msgs (day, created_at);

alter table public.lunch_days enable row level security;
alter table public.lunch_msgs enable row level security;
create policy "lunch days all" on public.lunch_days for all to authenticated using (true) with check (true);
create policy "lunch msgs read" on public.lunch_msgs for select to authenticated using (true);
create policy "lunch msgs insert" on public.lunch_msgs for insert to authenticated with check (author = auth.uid());

alter publication supabase_realtime add table public.lunch_days, public.lunch_msgs;
