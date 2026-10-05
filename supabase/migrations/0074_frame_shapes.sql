-- Custom frame shapes you chose to keep (a small PNG mask as a data URL). Shared by both of you.
create table if not exists public.frame_shapes (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'shape',
  mask text not null check (length(mask) < 400000),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.frame_shapes enable row level security;
create policy "frame shapes all" on public.frame_shapes for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.frame_shapes;
