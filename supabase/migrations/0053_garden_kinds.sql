-- Garden kinds: carts and dispos instead of "vape", dabs instead of "concentrate", no tinctures.
alter table public.garden_items drop constraint if exists garden_items_kind_check;
update public.garden_items set kind = 'cart' where kind = 'vape';
update public.garden_items set kind = 'dab' where kind = 'concentrate';
update public.garden_items set kind = 'other' where kind = 'tincture';
alter table public.garden_items add constraint garden_items_kind_check
  check (kind in ('flower', 'preroll', 'cart', 'dispo', 'dab', 'edible', 'other'));
