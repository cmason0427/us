-- Posts come in kinds: a normal update, a ⭐ star, or a spicy "lunch: you?".
alter table public.posts
  add column kind text not null default 'post' check (kind in ('post', 'star', 'lunch_you')),
  add column to_user uuid references auth.users (id) on delete cascade,  -- who a star / invite is for
  add column star_color text,                                             -- ids from src/lib/stars.ts
  add column star_for text;                                               -- "cleaning the house"; the note is `text`
