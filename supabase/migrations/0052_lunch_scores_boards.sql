-- Lunches: each of you slides 1-10 (1 never again · 4 no opinion · 10 new fav).
create table public.lunch_ratings (
  lunch_id uuid not null references public.lunch_log (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score integer not null check (score between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (lunch_id, user_id)
);
alter table public.lunch_ratings enable row level security;
create policy "lunch ratings read" on public.lunch_ratings for select to authenticated using (true);
create policy "lunch ratings own" on public.lunch_ratings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.lunch_ratings;

-- Boards: things can be tilted; text cards may start empty.
alter table public.thread_items add column rot real not null default 0;
alter table public.thread_items drop constraint if exists thread_items_has_something;
alter table public.thread_items add constraint thread_items_has_something
  check (kind in ('sticky', 'note') or coalesce(length(trim(text)), 0) > 0 or photo_path is not null or link is not null or ink is not null);

-- Money: a specific upcoming payday can be set ahead of time (same table as "what landed").
