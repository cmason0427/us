-- Spicy want-to-try ideas: each of you can react (one each) and leave notes.
create table public.spicy_reactions (
  item_id uuid not null references public.spicy_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create table public.spicy_item_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.spicy_items (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);
alter table public.spicy_reactions enable row level security;
alter table public.spicy_item_notes enable row level security;
-- Same gate as Spicy itself, and only on items you can see.
create policy "spicy reactions read" on public.spicy_reactions for select to authenticated
  using (public.spicy_unlocked() and exists (select 1 from public.spicy_items i where i.id = item_id));
create policy "spicy reactions own" on public.spicy_reactions for all to authenticated
  using (user_id = auth.uid() and public.spicy_unlocked()) with check (user_id = auth.uid() and public.spicy_unlocked() and exists (select 1 from public.spicy_items i where i.id = item_id));
create policy "spicy notes read" on public.spicy_item_notes for select to authenticated
  using (public.spicy_unlocked() and exists (select 1 from public.spicy_items i where i.id = item_id));
create policy "spicy notes add" on public.spicy_item_notes for insert to authenticated
  with check (author = auth.uid() and public.spicy_unlocked() and exists (select 1 from public.spicy_items i where i.id = item_id));
create policy "spicy notes delete own" on public.spicy_item_notes for delete to authenticated using (author = auth.uid());
alter publication supabase_realtime add table public.spicy_reactions, public.spicy_item_notes;
