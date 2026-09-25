-- "Something new since you last looked" dots in the menu.
create table public.section_seen (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table public.section_seen enable row level security;
create policy "section seen own" on public.section_seen for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- When the OTHER person last added or changed something in each section.
-- Only timestamps come out (never content), so it's safe to run as definer.
create or replace function public.section_activity()
returns table (section text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (values
    ('/calendar', (select max(created_at) from events where created_by <> auth.uid())),
    ('/lists', (select max(created_at) from tasks where created_by <> auth.uid() and list_type in ('shared', 'household'))),
    ('/dogs', (select max(created_at) from tasks where created_by <> auth.uid() and list_type = 'dogs' and template_id is null)),
    ('/shopping', (select max(created_at) from shop_items where created_by <> auth.uid())),
    ('/eat', greatest(
      (select max(created_at) from food_places where created_by <> auth.uid()),
      (select max(created_at) from home_meals where created_by <> auth.uid()),
      (select max(created_at) from lunch_log where made_by <> auth.uid()))),
    ('/little', greatest(
      (select max(created_at) from little_things where author <> auth.uid() and kind = 'fact'),
      (select max(created_at) from us_dates where created_by <> auth.uid()),
      (select max(created_at) from us_date_notes where author <> auth.uid()),
      (select max(created_at) from people where created_by <> auth.uid()))),
    ('/do', greatest(
      (select max(created_at) from activities where created_by <> auth.uid()),
      (select max(created_at) from day_plans where created_by <> auth.uid()))),
    ('/nerd', greatest(
      (select max(created_at) from decks where owner <> auth.uid()),
      (select max(created_at) from deck_calls where from_user <> auth.uid()),
      (select max(created_at) from watchlist where added_by <> auth.uid()))),
    ('/garden', greatest(
      (select max(created_at) from garden_items where created_by <> auth.uid()),
      (select max(updated_at) from garden_reviews where user_id <> auth.uid()))),
    ('/spicy', greatest(
      (select max(created_at) from spicy_items where author <> auth.uid() and (kind = 'try' or to_user = auth.uid())),
      (select max(created_at) from spicy_media where added_by <> auth.uid()),
      (select max(created_at) from spicy_reactions where user_id <> auth.uid()),
      (select max(created_at) from spicy_item_notes where author <> auth.uid()))),
    ('/places', (select max(created_at) from address_book where created_by <> auth.uid()))
  ) as t(section, last_at);
$$;
grant execute on function public.section_activity() to authenticated;
