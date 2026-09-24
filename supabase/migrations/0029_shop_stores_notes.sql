-- Shopping: where to get it (a store, "Online", Costco…) separate from what
-- kind of thing it is (category), an order link, and a note to yourselves.
create table public.shop_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shop_stores enable row level security;
create policy "shop stores all" on public.shop_stores for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.shop_stores;

alter table public.shop_items
  add column store_id uuid references public.shop_stores (id) on delete set null,
  add column link text,
  add column note text;
