-- Mood asks ("Lunch: you? 😏", "In the mood. Are you?", or your own words)
-- reuse the lunch_you post kind. A "not right now" is kept as reply = 'no' so
-- the 3-hour "you already asked" check still sees it, but it leaves the feed.
alter table public.posts drop constraint if exists posts_reply_check;
alter table public.posts add constraint posts_reply_check check (reply in ('yes', 'no'));
