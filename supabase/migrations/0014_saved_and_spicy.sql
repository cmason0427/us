-- Saved photos in private folders, and 🌶️ Spicy (things added for the other person).

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_spicy boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index folders_one_spicy_each on public.folders (owner) where is_spicy;

-- A saved photo is its own copy (under the saver's storage folder), so it
-- outlives the post it came from.
create table public.saves (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id uuid not null references public.folders (id) on delete cascade,
  storage_path text not null,
  caption text,
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index saves_folder_idx on public.saves (folder_id, created_at desc);

alter table public.folders enable row level security;
alter table public.saves enable row level security;
-- Folders and saves are private to their owner.
create policy "folders own" on public.folders for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "saves own" on public.saves for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and added_by = auth.uid());

-- The one way to put something in the other person's collection: their Spicy
-- folder (made on first use). Photos must be in the sender's own storage folder.
create function public.send_spicy(recipient uuid, paths text[], caption text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f uuid;
  p text;
begin
  if auth.uid() is null or recipient = auth.uid() then
    raise exception 'Spicy things go to the other person.';
  end if;
  if not exists (select 1 from public.profiles where id = recipient) then
    raise exception 'No such person.';
  end if;
  foreach p in array paths loop
    if split_part(p, '/', 1) <> auth.uid()::text then
      raise exception 'Only your own uploads.';
    end if;
  end loop;
  select id into f from public.folders where owner = recipient and is_spicy;
  if f is null then
    insert into public.folders (owner, name, is_spicy) values (recipient, 'Spicy', true) returning id into f;
  end if;
  insert into public.saves (owner, folder_id, storage_path, caption, added_by)
  select recipient, f, x, nullif(trim(caption), ''), auth.uid() from unnest(paths) as x;
  return array_length(paths, 1);
end;
$$;
revoke all on function public.send_spicy(uuid, text[], text) from public;
grant execute on function public.send_spicy(uuid, text[], text) to authenticated;

-- Feed posts can be the little "🌶️ added something for you" note.
alter table public.posts add column spicy boolean not null default false;

alter publication supabase_realtime add table public.folders, public.saves;
