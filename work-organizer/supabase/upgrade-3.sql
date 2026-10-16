-- Work Organizer — upgrade 3 (image attachments)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Images are compressed in the browser before upload (usually 100–300 KB each).

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/webp', 'image/jpeg', 'image/png'],
    file_size_limit = 10485760
where id = 'attachments';

-- Alarms: minutes before the start (do date + time) and before the deadline.
-- 0 = at the time itself. Example: {0,15} = at 9:00 and at 8:45.
alter table public.tasks add column if not exists start_alerts integer[] not null default '{0}';
alter table public.tasks add column if not exists deadline_alerts integer[] not null default '{60}';
alter table public.profiles add column if not exists remind_start boolean not null default true;
alter table public.profiles add column if not exists alarm_email boolean not null default false;
