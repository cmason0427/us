-- The day-by-day ledger runs from ledger_from (the first day it was used, or
-- the last time a balance check-in re-evened things); locked_at says when a
-- paycheck's daily rate was last set.
alter table public.budget_rates add column locked_at timestamptz not null default now();
alter table public.budget_rates add column ledger_from date;
