-- Work Organizer — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: everything uses "if not exists" / "or replace".

create extension if not exists pgcrypto;

-- ───────────────────────────── People ─────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  color text not null default '#2F5FD0',
  must_change_password boolean not null default false,
  -- notifications
  notify_email text,                       -- null → use login email
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  digest_enabled boolean not null default true,
  digest_time time not null default '08:00',
  remind_due_tomorrow boolean not null default true,
  remind_overdue boolean not null default true,
  remind_followups boolean not null default true,
  remind_assigned boolean not null default true,
  quiet_start time default '19:00',
  quiet_end time default '07:30',
  quiet_weekends boolean not null default true,
  timezone text not null default 'UTC',
  theme text not null default 'system',
  created_at timestamptz not null default now()
);

-- Create a profile automatically for every new login
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this script ran
insert into public.profiles (id, email, full_name)
select u.id, u.email, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;

-- ───────────────────────────── Tasks ─────────────────────────────

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default 'gray',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  title text not null,
  status text not null default 'To do'
    check (status in ('To do', 'In progress', 'Waiting on someone', 'Done')),
  given_by text check (given_by in ('Manager', 'Me', 'Client', 'Other team')),
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  category text check (category in ('Admin', 'Reporting', 'Partner', 'Meeting', 'Learning', 'Other')),
  do_date date,
  deadline date,
  follow_up_date date,
  follow_up_with text,
  notes text not null default '',
  remind_at timestamptz,
  position double precision not null default extract(epoch from now()),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_deadline_idx on public.tasks (deadline);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (task_id, user_id)
);

create table if not exists public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now()
);

-- "task_id is blocked until blocked_by is Done"
create table if not exists public.task_blockers (
  task_id uuid not null references public.tasks (id) on delete cascade,
  blocked_by uuid not null references public.tasks (id) on delete cascade,
  primary key (task_id, blocked_by),
  check (task_id <> blocked_by)
);

-- Keep updated_at / updated_by / completed_at right, whoever edits
create or replace function public.touch_task()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.status = 'Done' and (tg_op = 'INSERT' or old.status is distinct from 'Done') then
    new.completed_at := now();
  elsif new.status <> 'Done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.touch_task();

-- ───────────────────────────── Meetings ─────────────────────────────

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null default now(),
  attendees text not null default '',
  agenda text not null default '',
  notes text not null default '',
  decisions text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  text text not null,
  task_id uuid references public.tasks (id) on delete set null,
  position double precision not null default extract(epoch from now())
);

create table if not exists public.meeting_tasks (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  primary key (meeting_id, task_id)
);

-- ───────────────────────────── Attachments (PDF) ─────────────────────────────

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete cascade,
  name text not null,
  size bigint not null,
  path text not null unique,
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (task_id is not null or meeting_id is not null)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "team reads attachments" on storage.objects;
create policy "team reads attachments" on storage.objects
  for select to authenticated using (bucket_id = 'attachments');
drop policy if exists "team uploads attachments" on storage.objects;
create policy "team uploads attachments" on storage.objects
  for insert to authenticated with check (bucket_id = 'attachments');
drop policy if exists "team deletes attachments" on storage.objects;
create policy "team deletes attachments" on storage.objects
  for delete to authenticated using (bucket_id = 'attachments');

-- Storage used, for the meter on the Team page
create or replace function public.storage_used()
returns bigint language sql security definer set search_path = public, storage as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)
  from storage.objects where bucket_id = 'attachments';
$$;

-- ───────────────────────────── Daily checklist ─────────────────────────────

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  scope text not null default 'team' check (scope in ('team', 'personal')),
  owner_id uuid references public.profiles (id) on delete cascade,
  position double precision not null default extract(epoch from now()),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((scope = 'team' and owner_id is null) or (scope = 'personal' and owner_id is not null))
);

create table if not exists public.checklist_checks (
  item_id uuid not null references public.checklist_items (id) on delete cascade,
  day date not null,
  user_id uuid references public.profiles (id) on delete set null default auth.uid(),
  checked_at timestamptz not null default now(),
  primary key (item_id, day)
);

-- ───────────────────────────── Notifications ─────────────────────────────

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  task_id uuid references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  sent_at timestamptz          -- set once email/desktop delivery has been handled
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- One row per reminder already sent, so nothing is sent twice
create table if not exists public.reminder_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- "Assigned to you" → a notification for the new assignee
create or replace function public.notify_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record; actor text;
begin
  if new.user_id = auth.uid() then return new; end if;
  select title, number into t from public.tasks where id = new.task_id;
  select full_name into actor from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, kind, title, body, task_id)
  values (new.user_id, 'assigned',
          coalesce(actor, 'Someone') || ' assigned you a task',
          t.title, new.task_id);
  return new;
end $$;

drop trigger if exists task_assignees_notify on public.task_assignees;
create trigger task_assignees_notify after insert on public.task_assignees
  for each row execute function public.notify_assigned();

-- ───────────────────────────── Security (row level) ─────────────────────────────
-- Every logged-in team member can see and edit shared data.
-- Personal checklist items, notifications and push subscriptions are private.

do $$
declare t text;
begin
  foreach t in array array['profiles','tags','tasks','task_assignees','task_tags','subtasks',
    'task_blockers','meetings','meeting_actions','meeting_tasks','attachments',
    'checklist_items','checklist_checks','notifications','push_subscriptions','reminder_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array['tags','tasks','task_assignees','task_tags','subtasks',
    'task_blockers','meetings','meeting_actions','meeting_tasks','attachments']
  loop
    execute format('drop policy if exists "team access" on public.%I', t);
    execute format('create policy "team access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

drop policy if exists "team reads profiles" on public.profiles;
create policy "team reads profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "checklist items" on public.checklist_items;
create policy "checklist items" on public.checklist_items for all to authenticated
  using (scope = 'team' or owner_id = auth.uid())
  with check (scope = 'team' or owner_id = auth.uid());

drop policy if exists "checklist checks" on public.checklist_checks;
create policy "checklist checks" on public.checklist_checks for all to authenticated
  using (exists (select 1 from public.checklist_items i where i.id = item_id
                 and (i.scope = 'team' or i.owner_id = auth.uid())))
  with check (exists (select 1 from public.checklist_items i where i.id = item_id
                 and (i.scope = 'team' or i.owner_id = auth.uid())));

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- reminder_log: no policies → only the server (service key) can touch it.

-- ───────────────────────────── Live sync ─────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['profiles','tags','tasks','task_assignees','task_tags','subtasks',
    'task_blockers','meetings','meeting_actions','meeting_tasks','attachments',
    'checklist_items','checklist_checks','notifications']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────────────────────── Starter content ─────────────────────────────

insert into public.checklist_items (label, scope, position)
select v.label, 'team', v.pos from (values
  ('Check emails and Teams', 1),
  ('Review Today view in Tasks', 2),
  ('Check Overdue and Follow-ups views', 3),
  ('Update task statuses', 4),
  ('Plan tomorrow''s tasks', 5)
) as v(label, pos)
where not exists (select 1 from public.checklist_items where scope = 'team');

insert into public.tags (name, color) values
  ('urgent', 'red'), ('q4', 'blue'), ('finance', 'green')
on conflict (name) do nothing;

-- Three example tasks (delete them whenever you like)
do $$
declare t1 uuid; t2 uuid; t3 uuid;
begin
  if exists (select 1 from public.tasks) then return; end if;

  insert into public.tasks (title, status, given_by, priority, category, deadline, notes)
  values ('Example: draft agenda for the Q4 kickoff', 'To do', 'Manager', 'High', 'Meeting',
          current_date + 5, 'New from your manager and not assigned yet — it shows under "New from manager".')
  returning id into t1;

  insert into public.tasks (title, status, given_by, priority, category, do_date, deadline, notes)
  values ('Example: update the partner contact list', 'In progress', 'Me', 'Medium', 'Partner',
          current_date - 4, current_date - 2, 'The deadline has passed, so it is flagged as overdue.')
  returning id into t2;

  insert into public.tasks (title, status, given_by, priority, category, deadline, follow_up_date, follow_up_with, notes)
  values ('Example: get the signed contract back', 'Waiting on someone', 'Client', 'Medium', 'Partner',
          current_date + 7, current_date, 'Sarah (Legal)', 'Waiting on someone else — it shows in Follow-ups today.')
  returning id into t3;

  insert into public.task_tags (task_id, tag_id) select t1, id from public.tags where name = 'q4';
  insert into public.task_tags (task_id, tag_id) select t2, id from public.tags where name = 'urgent';
  insert into public.subtasks (task_id, title, done, position) values
    (t1, 'List the topics', true, 1), (t1, 'Book the room', false, 2), (t1, 'Send the invite', false, 3);
end $$;
