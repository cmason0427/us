-- Dog notes speak as the dog; dogs get profile photos.

-- ─── Dog notes post as the dog ───────────────────────────────────────────────
-- as_dog: written with "Dog note", so it shows as from the dog(s) ("the boys"
-- when it's all of them) rather than the person who typed it. Plain updates
-- tagged with dogs stay the person's.
alter table public.posts add column as_dog boolean not null default false;

-- The notes carried over from the old dog log were dog notes.
update public.posts p set as_dog = true
from public.kodo_logs k
where p.author = k.created_by and p.created_at = k.occurred_at and p.dogs = array[k.dog];

-- ─── Dog profiles ────────────────────────────────────────────────────────────
-- One row per dog id in src/lib/dogs.ts; just the photo for now. Either of you
-- can change it. The photo lives in the private photos bucket.
create table public.dogs (
  id text primary key,
  photo_path text,
  updated_at timestamptz not null default now()
);
insert into public.dogs (id) values ('kodo'), ('wiley') on conflict do nothing;

alter table public.dogs enable row level security;
create policy "dogs read" on public.dogs for select to authenticated using (true);
create policy "dogs update" on public.dogs for update to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.dogs;
