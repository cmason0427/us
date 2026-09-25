alter table public.lunch_log add column place_id uuid references public.food_places (id) on delete set null;
