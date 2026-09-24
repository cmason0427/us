-- Shopping list with your own categories, drag-ordered; plus the pantry.

create table public.shop_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  detail text,                                  -- brand / type, optional
  category_id uuid references public.shop_categories (id) on delete set null,
  position integer not null default 0,
  claimed_by uuid references auth.users (id) on delete set null,   -- "I got this"
  bought boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index shop_items_cat_idx on public.shop_items (category_id, position);

alter table public.shop_categories enable row level security;
alter table public.shop_items enable row level security;
create policy "shop cats all" on public.shop_categories for all to authenticated using (true) with check (true);
create policy "shop items all" on public.shop_items for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.shop_categories, public.shop_items;
