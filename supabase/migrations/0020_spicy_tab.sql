-- The Spicy tab: fantasies (private), a shared want-to-try list, and little
-- notes for each other. Everything is readable only right after a PIN unlock.

create table public.spicy_items (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('fantasy', 'try', 'remember', 'worked', 'didnt')),
  text text not null check (length(trim(text)) > 0),
  to_user uuid references auth.users (id) on delete cascade,   -- notes are for the other person
  created_at timestamptz not null default now()
);
create index spicy_items_kind_idx on public.spicy_items (kind, created_at desc);

alter table public.spicy_items enable row level security;

-- fantasy: only the author; try: both; notes: author and the person it's for.
create policy "spicy read" on public.spicy_items for select to authenticated using (
  public.spicy_unlocked() and (
    (kind = 'fantasy' and author = auth.uid())
    or kind = 'try'
    or (kind in ('remember', 'worked', 'didnt') and (author = auth.uid() or to_user = auth.uid()))
  )
);
create policy "spicy add" on public.spicy_items for insert to authenticated with check (author = auth.uid() and public.spicy_unlocked());
create policy "spicy edit own" on public.spicy_items for update to authenticated
  using (author = auth.uid() and public.spicy_unlocked()) with check (author = auth.uid());
-- Either of you can take things off the list; notes are cleared by whoever they're for.
create policy "spicy remove" on public.spicy_items for delete to authenticated using (
  public.spicy_unlocked() and (
    author = auth.uid() or kind = 'try' or (kind in ('remember', 'worked', 'didnt') and to_user = auth.uid())
  )
);

alter publication supabase_realtime add table public.spicy_items;

-- "Lunch: you? 😏" in the feed: the answer ('yes'); a no deletes the post.
alter table public.posts add column reply text check (reply in ('yes'));
