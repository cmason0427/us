-- Hidden parts: `veil` is now how it opens (tap, double, agree, button, twice);
-- old posts keep their surprise/spoiler/warning value and open with a tap.
-- `veil_ack` holds the yes/no question or the button's label.
alter table public.posts drop constraint if exists posts_veil_check;
alter table public.posts add column if not exists veil_note text;
alter table public.posts add column if not exists veil_confetti boolean not null default false;
