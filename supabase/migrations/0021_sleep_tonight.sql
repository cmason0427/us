-- Where each of you is sleeping tonight. No row for a night = not set (the
-- other person sees "not sure yet"); a row with neither place = chose "not sure".
-- "Tonight" is keyed by the phone's date, rolling over at 5am (so 1am still
-- counts as last night).
create table public.sleep_nights (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  night date not null,
  house_of uuid references auth.users (id) on delete cascade,  -- whose place, or null
  custom text,                                                  -- somewhere else
  updated_at timestamptz not null default now(),
  primary key (user_id, night),
  check (house_of is null or custom is null)
);
alter table public.sleep_nights enable row level security;
create policy "sleep read" on public.sleep_nights for select to authenticated using (true);
-- Only you set yours; theirs is read-only to you.
create policy "sleep own" on public.sleep_nights for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.sleep_nights;
