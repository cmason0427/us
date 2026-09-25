-- Birthdays, anniversaries and holidays sit on the calendar as "on the radar".
update public.events set type = 'radar'
  where series_id in (select id from public.event_series where freq = 'yearly') and type = 'confirmed';

-- Notes on a lunch from either of you, and notes kept on a meal or place.
create table public.lunch_notes (
  id uuid primary key default gen_random_uuid(),
  lunch_id uuid not null references public.lunch_log (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);
create table public.food_notes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('meal', 'place')),
  ref_id uuid not null,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);
create index food_notes_ref_idx on public.food_notes (kind, ref_id);
alter table public.lunch_notes enable row level security;
alter table public.food_notes enable row level security;
create policy "lunch notes read" on public.lunch_notes for select to authenticated using (true);
create policy "lunch notes add" on public.lunch_notes for insert to authenticated with check (author = auth.uid());
create policy "lunch notes delete own" on public.lunch_notes for delete to authenticated using (author = auth.uid());
create policy "food notes read" on public.food_notes for select to authenticated using (true);
create policy "food notes add" on public.food_notes for insert to authenticated with check (author = auth.uid());
create policy "food notes delete" on public.food_notes for delete to authenticated using (true);
alter publication supabase_realtime add table public.lunch_notes, public.food_notes;
