-- Checklists: a to-do made of items (like a shopping trip). It finishes itself
-- once every item is checked, removed, or moved to another list.
create table public.task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index task_items_task_idx on public.task_items (task_id, position);
alter table public.task_items enable row level security;
-- Same visibility as the to-do it belongs to (personal lists stay personal).
create policy "task items via task" on public.task_items for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id))
  with check (exists (select 1 from public.tasks t where t.id = task_id));

-- Soft repeats: a saved checklist with a suggested day ("chore day today?").
create table public.checklist_presets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  emoji text,
  items text[] not null default '{}',
  weekday integer check (weekday between 0 and 6),
  list_type text not null default 'shared',
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.checklist_prompts (
  preset_id uuid not null references public.checklist_presets (id) on delete cascade,
  day date not null,
  answer text not null check (answer in ('yes', 'no')),
  answered_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (preset_id, day)
);
alter table public.checklist_presets enable row level security;
alter table public.checklist_prompts enable row level security;
create policy "checklist presets all" on public.checklist_presets for all to authenticated using (true) with check (true);
create policy "checklist prompts all" on public.checklist_prompts for all to authenticated using (true) with check (true);
alter table public.tasks add column checklist_preset_id uuid references public.checklist_presets (id) on delete set null;
alter publication supabase_realtime add table public.task_items, public.checklist_presets, public.checklist_prompts;
