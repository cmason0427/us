-- "DID YOU EAT?" check-ins. The ask never posts; the answer does (as a reply
-- to the ask), and the one who answered can update it any time.
create table public.eat_checks (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  answer text check (answer in ('yes', 'no', 'working')),
  note text,
  asked_at timestamptz not null default now(),
  answered_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz not null default now()
);
create index eat_checks_to_idx on public.eat_checks (to_user, created_at desc);
alter table public.eat_checks enable row level security;
create policy "eat checks read" on public.eat_checks for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
create policy "eat checks ask" on public.eat_checks for insert to authenticated with check (from_user = auth.uid());
create policy "eat checks answer" on public.eat_checks for update to authenticated using (from_user = auth.uid() or to_user = auth.uid()) with check (from_user = auth.uid() or to_user = auth.uid());
create policy "eat checks remove" on public.eat_checks for delete to authenticated using (from_user = auth.uid());
alter publication supabase_realtime add table public.eat_checks;

alter table public.posts add column eat_check_id uuid references public.eat_checks (id) on delete cascade;
alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('post', 'star', 'lunch_you', 'plan', 'vibe', 'eat'));
