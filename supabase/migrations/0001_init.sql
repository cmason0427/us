-- "Us" — initial schema.
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Two users only. Every row is visible to any signed-in user EXCEPT personal
-- to-dos, which are private to their owner. Signups should be disabled in the
-- Supabase dashboard so only the two pre-created accounts can ever sign in.

create extension if not exists pgcrypto;

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  timezone text not null default 'America/Chicago',
  notify_partner_posts boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile when an auth user is created. Name comes from the
-- `display_name` user metadata if set, otherwise the email's local part.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), initcap(split_part(new.email, '@', 1)))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Calendar ────────────────────────────────────────────────────────────────
create type public.event_type as enum ('confirmed', 'solo', 'ask', 'radar');
create type public.ask_status as enum ('pending', 'accepted', 'declined');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  type public.event_type not null,
  start_time timestamptz not null,
  end_time timestamptz,
  all_day boolean not null default false,
  notes text,
  location text,
  -- Only meaningful for type = 'ask'. 'accepted' renders as confirmed,
  -- 'declined' renders as a solo FYI.
  response_status public.ask_status,
  responded_at timestamptz,
  -- Minutes BEFORE start_time to send a reminder (null = no reminder). May be
  -- negative for all-day events, e.g. -480 = 8am on the day (start is midnight).
  reminder_lead_minutes integer,
  reminder_sent_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time >= start_time)
);
create index events_start_idx on public.events (start_time);
create index events_reminder_idx on public.events (start_time)
  where reminder_lead_minutes is not null and reminder_sent_at is null;

-- ─── Home feed ───────────────────────────────────────────────────────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text,
  created_at timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);

create table public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  width integer,
  height integer,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index post_photos_post_idx on public.post_photos (post_id);

create table public.post_reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

-- ─── Do Something ────────────────────────────────────────────────────────────
create type public.energy_level as enum ('low', 'medium', 'high');

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  energy_level public.energy_level not null,
  -- null = needs both of you; otherwise the one user it's for.
  participant uuid references auth.users (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Energy check-ins. `user_id` is whose energy it is; `entered_by` is whose
-- phone it was tapped on (so one of you can enter both when you're together).
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entered_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  energy public.energy_level not null,
  created_at timestamptz not null default now()
);
create index checkins_user_created_idx on public.checkins (user_id, created_at desc);

-- ─── Lists ───────────────────────────────────────────────────────────────────
create type public.list_type as enum ('personal', 'shared', 'household');
create type public.urgency as enum ('low', 'medium', 'high');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  list_type public.list_type not null,
  -- Set for personal tasks only; the one person who can see it.
  owner uuid references auth.users (id) on delete cascade,
  urgency public.urgency not null default 'low',
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((list_type = 'personal') = (owner is not null))
);
create index tasks_list_idx on public.tasks (list_type, done);

create type public.kodo_log_type as enum ('potty', 'note');
create type public.potty_kind as enum ('pee', 'poop', 'both');

create table public.kodo_logs (
  id uuid primary key default gen_random_uuid(),
  type public.kodo_log_type not null,
  potty_kind public.potty_kind,
  detail text,
  occurred_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((type = 'potty') = (potty_kind is not null))
);
create index kodo_logs_occurred_idx on public.kodo_logs (occurred_at desc);

-- ─── Push ────────────────────────────────────────────────────────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  subscription_json jsonb not null,
  created_at timestamptz not null default now()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
alter table public.post_reactions enable row level security;
alter table public.activities enable row level security;
alter table public.checkins enable row level security;
alter table public.tasks enable row level security;
alter table public.kodo_logs enable row level security;
alter table public.push_subscriptions enable row level security;

-- Profiles: both can read both; each edits only their own.
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Shared-everything tables: any signed-in user can read and edit; inserts must
-- be stamped with the caller's id so `created_by` can't be spoofed.
create policy "events read" on public.events for select to authenticated using (true);
create policy "events insert" on public.events for insert to authenticated with check (created_by = auth.uid());
create policy "events update" on public.events for update to authenticated using (true) with check (true);
create policy "events delete" on public.events for delete to authenticated using (true);

create policy "posts read" on public.posts for select to authenticated using (true);
create policy "posts insert" on public.posts for insert to authenticated with check (author = auth.uid());
create policy "posts update own" on public.posts for update to authenticated using (author = auth.uid());
create policy "posts delete own" on public.posts for delete to authenticated using (author = auth.uid());

create policy "photos read" on public.post_photos for select to authenticated using (true);
create policy "photos insert own post" on public.post_photos for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid()));
create policy "photos delete own post" on public.post_photos for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid()));

create policy "reactions read" on public.post_reactions for select to authenticated using (true);
create policy "reactions insert own" on public.post_reactions for insert to authenticated with check (user_id = auth.uid());
create policy "reactions delete own" on public.post_reactions for delete to authenticated using (user_id = auth.uid());

create policy "activities read" on public.activities for select to authenticated using (true);
create policy "activities insert" on public.activities for insert to authenticated with check (created_by = auth.uid());
create policy "activities update" on public.activities for update to authenticated using (true) with check (true);
create policy "activities delete" on public.activities for delete to authenticated using (true);

create policy "checkins read" on public.checkins for select to authenticated using (true);
create policy "checkins insert" on public.checkins for insert to authenticated with check (entered_by = auth.uid());

-- Tasks: personal ones are invisible to the other person, full stop.
create policy "tasks read" on public.tasks for select to authenticated
  using (list_type <> 'personal' or owner = auth.uid());
create policy "tasks insert" on public.tasks for insert to authenticated
  with check (created_by = auth.uid() and (list_type <> 'personal' or owner = auth.uid()));
create policy "tasks update" on public.tasks for update to authenticated
  using (list_type <> 'personal' or owner = auth.uid())
  with check (list_type <> 'personal' or owner = auth.uid());
create policy "tasks delete" on public.tasks for delete to authenticated
  using (list_type <> 'personal' or owner = auth.uid());

create policy "kodo read" on public.kodo_logs for select to authenticated using (true);
create policy "kodo insert" on public.kodo_logs for insert to authenticated with check (created_by = auth.uid());
create policy "kodo update" on public.kodo_logs for update to authenticated using (true) with check (true);
create policy "kodo delete" on public.kodo_logs for delete to authenticated using (true);

-- Push subscriptions are only ever touched by their owner from the client; the
-- server reads everyone's with the service-role key (which bypasses RLS).
create policy "push own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep updated_at honest on events.
create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ─── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table
  public.profiles,
  public.events,
  public.posts,
  public.post_photos,
  public.post_reactions,
  public.activities,
  public.checkins,
  public.tasks,
  public.kodo_logs;

-- ─── Storage (photos) ────────────────────────────────────────────────────────
-- Private bucket; the app renders photos through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "photos bucket read" on storage.objects for select to authenticated
  using (bucket_id = 'photos');
create policy "photos bucket upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos bucket delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
