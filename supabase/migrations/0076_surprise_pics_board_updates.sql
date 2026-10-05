-- Photos can live inside a post's hidden part (shown only once it's opened),
-- and a post can be a "board update": a snapshot of a board, linked back to it.
alter table public.post_photos add column if not exists hidden boolean not null default false;
alter table public.posts add column if not exists thread_id uuid references public.threads (id) on delete set null;
