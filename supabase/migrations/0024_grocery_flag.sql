-- One shopping list for everything; groceries are the subset that also shows
-- in Food. Things added from Food are groceries; anything else can opt in.
alter table public.shop_items add column grocery boolean not null default false;
update public.shop_items set grocery = true;  -- everything so far came from Food
