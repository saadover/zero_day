-- Work Organizer — reminder schedule (run AFTER the app is deployed on Vercel)
-- 1. Replace YOUR-APP-URL with your Vercel address, e.g. https://work-organizer.vercel.app
-- 2. Replace YOUR-CRON-SECRET with the same value you set as CRON_SECRET in Vercel
-- 3. Paste into Supabase → SQL Editor → Run
-- It calls the reminder job every 15 minutes. Run it again any time to change the values.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'work-organizer-reminders';

select cron.schedule(
  'work-organizer-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'YOUR-APP-URL/api/reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR-CRON-SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Check it ran (wait 15 minutes):
--   select status_code, content from net._http_response order by created desc limit 5;
