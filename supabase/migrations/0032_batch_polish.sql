-- Activity ideas: "either of us / doesn't matter" as well as both or one person.
alter table public.activities add column anyone boolean not null default false;
alter table public.activities add column emoji text;

-- Emoji on presets.
alter table public.event_templates add column emoji text;
alter table public.task_templates add column emoji text;

-- Calendar color markers, separate from the kind of plan (who's going).
-- Colors are a fixed set of keys; either of you can name what each one means.
alter table public.events add column color text;
alter table public.event_templates add column color text;
create table public.calendar_colors (
  color text primary key,
  label text,
  updated_at timestamptz not null default now()
);
alter table public.calendar_colors enable row level security;
create policy "calendar colors all" on public.calendar_colors for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.calendar_colors;

-- Shopping: several places you could get something (one category still).
alter table public.shop_items add column store_ids uuid[] not null default '{}';
update public.shop_items set store_ids = array[store_id] where store_id is not null;

-- Pantry: "almost out", and a shelf/tag (sauces, baking, fridge…).
alter table public.pantry add column low boolean not null default false;
alter table public.pantry add column tag text;
