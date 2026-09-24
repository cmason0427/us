-- Time-block plans on the calendar: a slot on a day with activities in a
-- preferred order, notes from either of you, and both of you can edit it all.
-- Not in the feed, except one note when it's sent to the other person.

create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  start_at time not null,
  end_at time not null,
  title text,
  sent_at timestamptz,                         -- shared with the other person
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index day_plans_day_idx on public.day_plans (day);

create table public.day_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.day_plans (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  activity_id uuid references public.activities (id) on delete set null,
  position integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade
);
create index day_plan_items_plan_idx on public.day_plan_items (plan_id, position);

create table public.day_plan_notes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.day_plans (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);

alter table public.day_plans enable row level security;
alter table public.day_plan_items enable row level security;
alter table public.day_plan_notes enable row level security;
create policy "plans all" on public.day_plans for all to authenticated using (true) with check (true);
create policy "plan items all" on public.day_plan_items for all to authenticated using (true) with check (true);
create policy "plan notes read" on public.day_plan_notes for select to authenticated using (true);
create policy "plan notes add" on public.day_plan_notes for insert to authenticated with check (author = auth.uid());
create policy "plan notes remove own" on public.day_plan_notes for delete to authenticated using (author = auth.uid());

alter publication supabase_realtime add table public.day_plans, public.day_plan_items, public.day_plan_notes;

-- The one feed note when a plan is sent ("new idea on your calendar").
alter table public.posts add column plan_id uuid references public.day_plans (id) on delete set null;
alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('post', 'star', 'lunch_you', 'plan'));
