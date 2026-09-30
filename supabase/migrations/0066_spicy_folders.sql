-- Spicy folders: personal (only the owner ever sees them), and a pic or video
-- can sit in any number of them while staying in the shared collection.
create table public.spicy_folders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  cover_media_id uuid references public.spicy_media (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.spicy_folder_items (
  folder_id uuid not null references public.spicy_folders (id) on delete cascade,
  media_id uuid not null references public.spicy_media (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (folder_id, media_id)
);
alter table public.spicy_folders enable row level security;
alter table public.spicy_folder_items enable row level security;
create policy "spicy folders own" on public.spicy_folders for all to authenticated
  using (owner = auth.uid() and public.spicy_unlocked())
  with check (owner = auth.uid() and public.spicy_unlocked());
create policy "spicy folder items own" on public.spicy_folder_items for all to authenticated
  using (exists (select 1 from public.spicy_folders f where f.id = folder_id and f.owner = auth.uid()) and public.spicy_unlocked())
  with check (exists (select 1 from public.spicy_folders f where f.id = folder_id and f.owner = auth.uid()) and public.spicy_unlocked());
alter publication supabase_realtime add table public.spicy_folders, public.spicy_folder_items;
