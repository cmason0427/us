-- Boards: grounds (0 Backdrop, 1 Middle, 2 Up front), locks, groups and
-- containers ("box" items that hold other things).
alter table public.thread_items add column if not exists ground smallint not null default 1 check (ground between 0 and 2);
alter table public.thread_items add column if not exists locked boolean not null default false;
alter table public.thread_items add column if not exists group_id uuid;
alter table public.thread_items add column if not exists parent_id uuid references public.thread_items (id) on delete set null;
alter table public.thread_items drop constraint if exists thread_items_kind_check;
alter table public.thread_items add constraint thread_items_kind_check check (kind in ('note', 'sticky', 'photo', 'link', 'ink', 'sticker', 'grid', 'box'));
alter table public.thread_items drop constraint if exists thread_items_has_something;
alter table public.thread_items add constraint thread_items_has_something
  check (kind in ('sticky', 'note', 'grid', 'box') or coalesce(length(trim(text)), 0) > 0 or photo_path is not null or link is not null or ink is not null);

-- "What time were you thinking?": a quiet ask for one person. Once it's
-- answered with a time it becomes a feed post for both; "not sure yet" just
-- closes it gently.
create table if not exists public.time_asks (
  id uuid primary key default gen_random_uuid(),
  asked_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  question text not null,
  note text,
  wants text not null default 'time' check (wants in ('time', 'day', 'range')),
  status text not null default 'open' check (status in ('open', 'answered', 'unsure', 'withdrawn')),
  answer_time time,
  answer_day date,
  answer_until date,
  answer_note text,
  answered_at timestamptz,
  seen_by_asker boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.time_asks enable row level security;
drop policy if exists "time asks read" on public.time_asks;
create policy "time asks read" on public.time_asks for select to authenticated using (asked_by = auth.uid() or to_user = auth.uid());
drop policy if exists "time asks insert" on public.time_asks;
create policy "time asks insert" on public.time_asks for insert to authenticated with check (asked_by = auth.uid());
drop policy if exists "time asks update" on public.time_asks;
create policy "time asks update" on public.time_asks for update to authenticated using (asked_by = auth.uid() or to_user = auth.uid()) with check (asked_by = auth.uid() or to_user = auth.uid());
drop policy if exists "time asks delete" on public.time_asks;
create policy "time asks delete" on public.time_asks for delete to authenticated using (asked_by = auth.uid());
alter publication supabase_realtime add table public.time_asks;

alter table public.posts add column if not exists time_ask_id uuid references public.time_asks (id) on delete set null;
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('post', 'star', 'lunch_you', 'plan', 'vibe', 'eat', 'time'));
