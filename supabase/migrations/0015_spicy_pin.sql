-- Spicy needs your PIN again: the database won't return Spicy saves unless you
-- entered it in the last few minutes (/api/auth/pin/spicy writes the unlock).

create table public.spicy_unlocks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null
);
alter table public.spicy_unlocks enable row level security; -- no policies: service role only

create function public.spicy_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.spicy_unlocks where user_id = auth.uid() and until > now());
$$;
grant execute on function public.spicy_unlocked() to authenticated;

create function public.is_spicy_folder(folder uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_spicy from public.folders where id = folder), false);
$$;
grant execute on function public.is_spicy_folder(uuid) to authenticated;

drop policy "saves own" on public.saves;
create policy "saves read" on public.saves for select to authenticated
  using (owner = auth.uid() and (not public.is_spicy_folder(folder_id) or public.spicy_unlocked()));
create policy "saves insert" on public.saves for insert to authenticated
  with check (owner = auth.uid() and added_by = auth.uid());
create policy "saves delete" on public.saves for delete to authenticated
  using (owner = auth.uid() and (not public.is_spicy_folder(folder_id) or public.spicy_unlocked()));
