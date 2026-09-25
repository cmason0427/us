-- Either of you can set (and fix) both people's meal and lunch ratings.
drop policy if exists "food ratings write" on public.food_ratings;
create policy "food ratings write" on public.food_ratings for all to authenticated using (true) with check (true);
drop policy if exists "lunch ratings own" on public.lunch_ratings;
create policy "lunch ratings write" on public.lunch_ratings for all to authenticated using (true) with check (true);
