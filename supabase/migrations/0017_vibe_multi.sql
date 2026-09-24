-- Vibe checks can pick several feelings at once.
alter table public.vibe_checks add column choices text[] not null default '{}';
update public.vibe_checks set choices = array[choice] where choice is not null;
