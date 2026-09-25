-- Daily to-do presets can ping at a set time ("breakfast at 8:00").
alter table public.task_templates add column ping_at time;
alter table public.task_templates add column pinged_on date;

-- Pantry: where it lives and what kind of thing it is (replaces the one "shelf" tag).
alter table public.pantry add column area text;
alter table public.pantry add column type text;
update public.pantry set area = tag where tag in ('Fridge', 'Freezer');
update public.pantry set type = case tag
  when 'Vegetables' then 'Fruit & veg' when 'Fruit' then 'Fruit & veg'
  when 'Sauces' then 'Sauces & condiments' when 'Grains & pasta' then 'Pasta, rice & grains'
  when 'Canned' then 'Canned & jarred' else tag end
  where tag is not null and tag not in ('Fridge', 'Freezer');

-- Holidays and other people's birthdays: yearly dates that aren't ours.
-- rule 'date' = same day every year; 'nth' = nth weekday of a month (Thanksgiving),
-- nth 5 = last (Memorial Day).
create table public.occasions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  emoji text,
  kind text not null default 'holiday' check (kind in ('holiday', 'birthday', 'other')),
  rule text not null default 'date' check (rule in ('date', 'nth')),
  month integer not null check (month between 1 and 12),
  day integer check (day between 1 and 31),
  nth integer check (nth between 1 and 5),
  weekday integer check (weekday between 0 and 6),
  note text,
  series_id uuid references public.event_series (id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.occasions enable row level security;
create policy "occasions all" on public.occasions for all to authenticated using (true) with check (true);

-- Garden: what it's good for, so you can shop by mood.
alter table public.garden_reviews add column good_for text[] not null default '{}';

alter publication supabase_realtime add table public.occasions;
