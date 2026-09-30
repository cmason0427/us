-- "On loop": the song each of you has on repeat. Stays until you change or
-- remove it (never clears on its own). Both can see; you only set yours.
create table public.on_loop (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  title text,
  thumb text,
  updated_at timestamptz not null default now()
);
alter table public.on_loop enable row level security;
create policy "on loop read" on public.on_loop for select to authenticated using (true);
create policy "on loop own" on public.on_loop for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.on_loop;
