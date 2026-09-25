-- Repeating events: each occurrence is a real row sharing a series id, so
-- every view, reminder and filter just works. The rule lives on the series.
create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  freq text not null check (freq in ('weekly', 'biweekly', 'monthly_date', 'monthly_weekday')),
  until date not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.event_series enable row level security;
create policy "event series all" on public.event_series for all to authenticated using (true) with check (true);
alter table public.events add column series_id uuid references public.event_series (id) on delete set null;
create index events_series_idx on public.events (series_id, start_time) where series_id is not null;

-- Daily routines: a to-do preset can add itself every day. One per preset per
-- day, even if both phones try at once.
alter table public.task_templates add column daily boolean not null default false;
alter table public.tasks add column template_id uuid references public.task_templates (id) on delete set null;
alter table public.tasks add column for_day date;
-- Not partial: upserts need a plain unique index (nulls never collide anyway).
create unique index tasks_routine_day_idx on public.tasks (template_id, for_day);

-- "On my way": one quiet line each, replaced each time.
create table public.statuses (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(trim(text)) > 0 and length(text) <= 120),
  updated_at timestamptz not null default now()
);
alter table public.statuses enable row level security;
create policy "statuses read" on public.statuses for select to authenticated using (true);
create policy "statuses write" on public.statuses for insert to authenticated with check (user_id = auth.uid());
create policy "statuses update" on public.statuses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.statuses;

-- Little things to remember about each other. Facts are shared; gift ideas
-- are only ever visible to whoever wrote them (enforced here).
create table public.little_things (
  id uuid primary key default gen_random_uuid(),
  about_user uuid not null references auth.users (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'fact' check (kind in ('fact', 'gift')),
  label text,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);
alter table public.little_things enable row level security;
create policy "little things read" on public.little_things for select to authenticated
  using (kind = 'fact' or author = auth.uid());
create policy "little things insert" on public.little_things for insert to authenticated
  with check (author = auth.uid() and (kind = 'fact' or about_user <> auth.uid()));
create policy "little things update" on public.little_things for update to authenticated
  using (kind = 'fact' or author = auth.uid()) with check (kind = 'fact' or author = auth.uid());
create policy "little things delete" on public.little_things for delete to authenticated
  using (kind = 'fact' or author = auth.uid());
alter publication supabase_realtime add table public.little_things;

-- Shopping → to-dos: the items stay on the shopping list, linked to one to-do.
alter table public.shop_items add column task_id uuid references public.tasks (id) on delete set null;
