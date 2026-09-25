-- Budget: "my account has $X right now" check-ins. The newest one anchors safe-to-spend.
create table public.budget_balances (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null,
  as_of timestamptz not null default now()
);
alter table public.budget_balances enable row level security;
create policy "budget_balances own" on public.budget_balances for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Threads become boards: every item has a spot, a size and a color; ink is a drawn line.
alter table public.thread_items drop constraint if exists thread_items_check;
alter table public.thread_items add column kind text not null default 'note' check (kind in ('note', 'sticky', 'photo', 'link', 'ink'));
alter table public.thread_items add column x real;
alter table public.thread_items add column y real;
alter table public.thread_items add column w real;
alter table public.thread_items add column h real;
alter table public.thread_items add column color text;
alter table public.thread_items add column ink text;   -- SVG path data for drawings
alter table public.thread_items add column z integer not null default 0;
update public.thread_items set kind = case when photo_path is not null then 'photo' when link is not null then 'link' else 'note' end;
alter table public.thread_items add constraint thread_items_has_something
  check (coalesce(length(trim(text)), 0) > 0 or photo_path is not null or link is not null or ink is not null or kind = 'sticky');
-- Either of you can move or restyle anything on the board.
drop policy if exists "thread items update" on public.thread_items;
create policy "thread items update" on public.thread_items for update to authenticated using (true) with check (true);
