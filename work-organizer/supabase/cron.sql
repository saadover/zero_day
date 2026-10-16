-- Work Organizer — reminder schedule
-- Paste into Supabase → SQL Editor → Run. Safe to run again any time.
-- Runs the reminder job every minute. Creates its own password inside the database,
-- so nothing has to be copied into Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Private settings table: only the server (secret key) can read it.
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'work-organizer-reminders';

select cron.schedule(
  'work-organizer-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://work-organizer-jade.vercel.app/api/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.app_settings where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Check it ran (wait a minute):
--   select status_code, content from net._http_response order by created desc limit 5;
