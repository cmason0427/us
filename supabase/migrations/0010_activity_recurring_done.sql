-- Activities: keep-on-the-list vs one-time, and marking one-time ideas done.
-- A done one-time idea stops being suggested (it stays in a Done list, undoable).
alter table public.activities
  add column recurring boolean not null default true,
  add column done_at timestamptz,
  add column done_by uuid references auth.users (id) on delete set null;
