-- "Our usual" at a place: one line per person, either of you can write either.
create table public.place_orders (
  place_id uuid not null references public.food_places (id) on delete cascade,
  person_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (place_id, person_id)
);
alter table public.place_orders enable row level security;
create policy "place orders all" on public.place_orders for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.place_orders;

-- The lunch back-and-forth also works for breakfast and dinner. Those only
-- exist once someone starts one, and have no "where".
alter table public.lunch_msgs add column meal text not null default 'lunch' check (meal in ('breakfast', 'lunch', 'dinner'));
