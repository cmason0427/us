-- A second dog. The table keeps its original name; `dog` says whose log it is.
-- Everything logged before this was Kodo's. The list of dogs lives in
-- src/lib/dogs.ts, so adding one is a code change, not a migration.
alter table public.kodo_logs add column dog text not null default 'kodo';
alter table public.kodo_logs alter column dog drop default;
create index kodo_logs_dog_occurred_idx on public.kodo_logs (dog, occurred_at desc);
