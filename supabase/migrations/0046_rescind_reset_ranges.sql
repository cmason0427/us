-- One copy of a photo per folder.
delete from public.saves a using public.saves b
  where a.folder_id = b.folder_id and a.storage_path = b.storage_path and a.created_at > b.created_at;
create unique index if not exists saves_folder_path_idx on public.saves (folder_id, storage_path);

-- Deck calls: take one back before it's answered; after, both tap reset to clear it.
alter table public.deck_calls add column reset_votes uuid[] not null default '{}';
create policy "calls delete" on public.deck_calls for delete to authenticated using (true);

-- On my way: the other person can say "got it"; same take-back / reset rules.
alter table public.statuses add column acked_at timestamptz;
alter table public.statuses add column reset_votes uuid[] not null default '{}';
drop policy if exists "statuses update" on public.statuses;
create policy "statuses update" on public.statuses for update to authenticated using (true) with check (true);
create policy "statuses delete" on public.statuses for delete to authenticated using (true);

-- Pay that varies (commission): a low and a high.
alter table public.budget_income add column amount_max numeric(10, 2) check (amount_max >= 0);

-- Saves are copies (new paths), so remember where each came from to spot repeats.
alter table public.saves add column source_path text;
create unique index if not exists saves_folder_source_idx on public.saves (folder_id, source_path) where source_path is not null;
