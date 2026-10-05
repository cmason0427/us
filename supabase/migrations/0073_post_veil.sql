-- A hidden second part on a post: a surprise, a spoiler or a heads-up. It stays
-- covered in the feed until tapped; `veil_ack` (optional) is a disclaimer they
-- agree to first. `veil_photos` covers the post's photos too.
alter table public.posts add column if not exists veil text check (veil in ('surprise', 'spoiler', 'warning'));
alter table public.posts add column if not exists hidden_text text;
alter table public.posts add column if not exists veil_ack text;
alter table public.posts add column if not exists veil_photos boolean not null default false;
