-- OPTIONAL but recommended: run the reminder sweep every 5 minutes from
-- Supabase instead of relying on Vercel Cron.
--
-- Why: Vercel's Hobby plan only allows cron jobs once per day, which is fine
-- for "morning of" reminders but useless for "1 hour before". pg_cron + pg_net
-- are free on every Supabase plan.
--
-- Before running: replace the two placeholders below.
--   <APP_URL>      e.g. https://us-yourname.vercel.app
--   <CRON_SECRET>  the same value as the CRON_SECRET env var in Vercel

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'us-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := '<APP_URL>/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
  $$
);

-- To stop it later: select cron.unschedule('us-reminders');
