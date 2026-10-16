-- Work Organizer — upgrade 2 (times on dates, one-day checklist items, new reminders)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

alter table public.tasks add column if not exists do_time time;
alter table public.tasks add column if not exists deadline_time time;
alter table public.tasks add column if not exists follow_up_time time;

-- A checklist item can be for one specific day only (null = every day)
alter table public.checklist_items add column if not exists only_day date;

alter table public.profiles add column if not exists remind_due_today boolean not null default true;
alter table public.profiles add column if not exists remind_due_soon boolean not null default true;
