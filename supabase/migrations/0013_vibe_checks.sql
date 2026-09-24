-- Vibe check-ins: one asks, the other answers (a choice and/or words).
create table public.vibe_checks (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  choice text,        -- ids from src/lib/vibe.ts
  answer text,        -- their own words
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index vibe_checks_created_idx on public.vibe_checks (created_at desc);

alter table public.vibe_checks enable row level security;
create policy "vibe read" on public.vibe_checks for select to authenticated using (true);
create policy "vibe ask" on public.vibe_checks for insert to authenticated with check (from_user = auth.uid());
-- Only the person asked can answer.
create policy "vibe answer" on public.vibe_checks for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());

alter publication supabase_realtime add table public.vibe_checks;
