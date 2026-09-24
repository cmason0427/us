-- To-dos: which dog(s) a dog to-do is for, and an optional note.
alter table public.tasks add column dogs text[] not null default '{}';
alter table public.tasks add column notes text;

-- To-do presets: "Feed breakfast" for Kodo & Wiley, added in one tap.
-- Shared; either of you can add, use or remove any of them.
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  list_type public.list_type not null,
  dogs text[] not null default '{}',
  urgency public.urgency not null default 'low',
  notes text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Personal presets would add to whoever taps them; keep presets to shared lists.
  check (list_type <> 'personal')
);
alter table public.task_templates enable row level security;
create policy "task templates all" on public.task_templates for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.task_templates;

-- Dog profiles: everything you'd need at the vet without the other person.
alter table public.dogs
  add column breed text,
  add column birthday date,
  add column weight text,
  add column sex text,
  add column color text,
  add column microchip text,
  add column vet_name text,
  add column vet_phone text,
  add column vet_address text,
  add column emergency_vet text,
  add column meds text,
  add column feeding text,
  add column allergies text,
  add column vaccines text,
  add column insurance text,
  add column notes text,
  add column updated_by uuid references auth.users (id) on delete set null;
