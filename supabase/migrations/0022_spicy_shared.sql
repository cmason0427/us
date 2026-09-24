-- Spicy pics & videos become one shared collection, each tagged with who's in
-- it (one of you or both). Still readable only right after a PIN unlock.

create table public.spicy_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  people uuid[] not null default '{}',          -- who's in it; empty = not tagged yet
  caption text,
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index spicy_media_created_idx on public.spicy_media (created_at desc);

alter table public.spicy_media enable row level security;
create policy "spicy media read" on public.spicy_media for select to authenticated using (public.spicy_unlocked());
create policy "spicy media add" on public.spicy_media for insert to authenticated
  with check (public.spicy_unlocked() and added_by = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text);
create policy "spicy media tag" on public.spicy_media for update to authenticated using (public.spicy_unlocked()) with check (true);
create policy "spicy media remove" on public.spicy_media for delete to authenticated using (public.spicy_unlocked());
alter publication supabase_realtime add table public.spicy_media;

-- Move what was in the per-person Spicy folders (untagged), then retire them.
insert into public.spicy_media (storage_path, caption, added_by, created_at)
select s.storage_path, s.caption, s.added_by, s.created_at
from public.saves s join public.folders f on f.id = s.folder_id
where f.is_spicy;
delete from public.folders where is_spicy;
drop function if exists public.send_spicy(uuid, text[], text);
