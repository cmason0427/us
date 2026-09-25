-- A tally on a post ("Tootsie roll 1: logged"). Either of you can add one to
-- any post and tick it; functions so it works on the other person's post and
-- two quick taps from two phones both count.
alter table public.posts add column counter integer;
alter table public.posts add column counter_label text;

create or replace function public.set_post_counter(p uuid, label text, start integer default 0)
returns void language sql security definer set search_path = public as $$
  update posts
     set counter = case when label is null then null else start end,
         counter_label = nullif(trim(label), '')
   where id = p and auth.uid() is not null;
$$;

create or replace function public.bump_post_counter(p uuid, delta integer default 1)
returns integer language sql security definer set search_path = public as $$
  update posts set counter = greatest(0, coalesce(counter, 0) + delta)
   where id = p and counter is not null and auth.uid() is not null
  returning counter;
$$;

grant execute on function public.set_post_counter(uuid, text, integer) to authenticated;
grant execute on function public.bump_post_counter(uuid, integer) to authenticated;

-- Parker's tootsie roll post already has one logged.
update public.posts set counter = 1, counter_label = 'Tootsie rolls'
 where counter is null and text ilike '%tootsie roll counter%';
