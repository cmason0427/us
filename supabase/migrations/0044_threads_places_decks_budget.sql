-- Birthdays with an optional birth year (for "34th birthday").
alter table public.occasions add column year integer check (year between 1900 and 2100);

-- Threads: little shared brainstorm boards (Halloween costumes…). Never in the
-- feed, never a push; unseen changes show as a badge when you open the app.
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  emoji text,
  archived_at timestamptz,
  last_by uuid references auth.users (id) on delete set null,
  last_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.thread_items (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text,
  photo_path text,
  link text,
  created_at timestamptz not null default now(),
  check (coalesce(length(trim(text)), 0) > 0 or photo_path is not null or link is not null)
);
create index thread_items_thread_idx on public.thread_items (thread_id, created_at);
create table public.thread_reads (
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.threads enable row level security;
alter table public.thread_items enable row level security;
alter table public.thread_reads enable row level security;
create policy "threads all" on public.threads for all to authenticated using (true) with check (true);
create policy "thread items read" on public.thread_items for select to authenticated using (true);
create policy "thread items insert" on public.thread_items for insert to authenticated with check (author = auth.uid());
create policy "thread items update" on public.thread_items for update to authenticated using (author = auth.uid());
create policy "thread items delete" on public.thread_items for delete to authenticated using (true);
create policy "thread reads own" on public.thread_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Any new item bumps the thread's "last changed by".
create or replace function public.touch_thread() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.threads set last_by = coalesce(auth.uid(), new.author), last_at = now() where id = new.thread_id;
  return new;
end $$;
create trigger thread_items_touch after insert on public.thread_items for each row execute function public.touch_thread();

-- Address book: shared places with addresses (copy / open in maps).
create table public.address_book (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  address text,
  kind text,
  phone text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.address_book enable row level security;
create policy "address book all" on public.address_book for all to authenticated using (true) with check (true);

-- Decks: mana colors (W U B R G C). Posts can be about a deck.
alter table public.decks add column colors text[] not null default '{}';
alter table public.posts add column deck_id uuid references public.decks (id) on delete set null;

-- Garden: how it felt, with intensity (tag → 1..5).
alter table public.garden_reviews add column feel jsonb not null default '{}';

-- Pantry: several possible spots, most likely first.
alter table public.pantry add column areas text[] not null default '{}';
update public.pantry set areas = array[area] where area is not null;

-- Time-block plans: an optional address per step.
alter table public.day_plan_items add column address text;

-- ─── Budget: strictly personal. Every row is owner-only, both ways. ───────
create table public.budget_income (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(10, 2) not null check (amount >= 0),
  freq text not null check (freq in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  anchor date not null,          -- a real payday; the schedule counts from it
  day2 integer check (day2 between 1 and 31), -- semimonthly: the second day (anchor's day is the first)
  created_at timestamptz not null default now()
);
create table public.budget_paychecks (   -- what actually landed (overrides the expected amount that day)
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  income_id uuid references public.budget_income (id) on delete cascade,
  paid_on date not null,
  amount numeric(10, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create table public.budget_bills (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  emoji text,
  amount numeric(10, 2) not null check (amount >= 0),
  freq text not null check (freq in ('monthly', 'weekly', 'biweekly', 'quarterly', 'yearly')),
  anchor date not null,          -- a due date; the schedule counts from it
  autopay boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.budget_bill_paid (
  bill_id uuid not null references public.budget_bills (id) on delete cascade,
  due_on date not null,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  paid_at timestamptz not null default now(),
  primary key (bill_id, due_on)
);
create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  emoji text,
  ceiling numeric(10, 2) check (ceiling >= 0),   -- per month; null = just track
  warn_pct integer not null default 80 check (warn_pct between 1 and 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.budget_spend (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.budget_categories (id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  note text,
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create table public.budget_settings (
  owner uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  save_pct numeric(5, 2) not null default 10 check (save_pct between 0 and 100),
  save_fixed numeric(10, 2) not null default 0 check (save_fixed >= 0),
  cushion numeric(10, 2) not null default 0 check (cushion >= 0),
  updated_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['budget_income', 'budget_paychecks', 'budget_bills', 'budget_bill_paid', 'budget_categories', 'budget_spend', 'budget_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s own" on public.%I for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid())', t, t);
  end loop;
end $$;

alter publication supabase_realtime add table public.threads, public.thread_items, public.address_book;
