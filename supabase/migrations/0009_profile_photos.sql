-- Profile photos for the two of you (in the private photos bucket, like everything).
alter table public.profiles add column avatar_path text;
