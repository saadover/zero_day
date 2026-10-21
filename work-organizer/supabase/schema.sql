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

-- "brahim.saadi101@x.com" → "Brahim Saadi"
create or replace function public.name_from_email(email text)
returns text language sql immutable as $$
  select coalesce(nullif(initcap(trim(regexp_replace(regexp_replace(split_part(email, '@', 1), '\d+', '', 'g'), '[._-]+', ' ', 'g'))), ''), split_part(email, '@', 1));
$$;

-- Create a profile automatically for every new login
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), public.name_from_email(new.email)),
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
select u.id, u.email, public.name_from_email(u.email) from auth.users u
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
values ('attachments', 'attachments', false, 10485760, array['application/pdf', 'image/webp', 'image/jpeg', 'image/png'])
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

-- ───────────────────────────── Upgrade 2 ─────────────────────────────

alter table public.tasks add column if not exists do_time time;
alter table public.tasks add column if not exists deadline_time time;
alter table public.tasks add column if not exists follow_up_time time;

-- A checklist item can be for one specific day only (null = every day)
alter table public.checklist_items add column if not exists only_day date;

alter table public.profiles add column if not exists remind_due_today boolean not null default true;
alter table public.profiles add column if not exists remind_due_soon boolean not null default true;

-- ───────────────────────────── Upgrade 3 ─────────────────────────────
-- Alarms: minutes before the start (do date + time) and before the deadline.
-- 0 = at the time itself. Example: {0,15} = at 9:00 and at 8:45.
alter table public.tasks add column if not exists start_alerts integer[] not null default '{0}';
alter table public.tasks add column if not exists deadline_alerts integer[] not null default '{60}';
alter table public.profiles add column if not exists remind_start boolean not null default true;
alter table public.profiles add column if not exists alarm_email boolean not null default false;

-- ───────────────────────────── Upgrade 4: recurring reminders ─────────────────────────────

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text not null default '',
  at_time time not null default '09:00',
  days integer[] not null default '{1,2,3,4,5}',      -- 0 = Sunday … 6 = Saturday
  scope text not null default 'personal' check (scope in ('personal', 'team')),
  owner_id uuid references public.profiles (id) on delete cascade default auth.uid(),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- One row per reminder per day: who picked it up and who finished it.
create table if not exists public.routine_runs (
  routine_id uuid not null references public.routines (id) on delete cascade,
  day date not null,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  primary key (routine_id, day)
);

alter table public.routines enable row level security;
alter table public.routine_runs enable row level security;

drop policy if exists "routines" on public.routines;
create policy "routines" on public.routines for all to authenticated
  using (scope = 'team' or owner_id = auth.uid())
  with check (scope = 'team' or owner_id = auth.uid());

drop policy if exists "routine runs" on public.routine_runs;
create policy "routine runs" on public.routine_runs for all to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and (r.scope = 'team' or r.owner_id = auth.uid())))
  with check (exists (select 1 from public.routines r where r.id = routine_id and (r.scope = 'team' or r.owner_id = auth.uid())));

do $$
declare t text;
begin
  foreach t in array array['routines', 'routine_runs'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────────────────────── Upgrade 5: roles + processes ─────────────────────────────

-- ───────── Roles: admin / user / basic ─────────
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user', 'basic'));

-- The first person in the workspace becomes admin if there is none yet.
update public.profiles set role = 'admin'
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Only admins may change roles (the server's secret key may too).
create or replace function public.guard_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change roles';
  end if;
  if old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'There must always be at least one admin';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_role();

drop policy if exists "admins edit profiles" on public.profiles;
create policy "admins edit profiles" on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- New logins can carry their role from the "Add teammate" form.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, must_change_password, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), public.name_from_email(new.email)),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'user')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ───────── Processes ─────────
create table if not exists public.processes (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled process',
  outline text not null default '',
  scene jsonb not null default '{}'::jsonb,
  view text not null default 'bullets' check (view in ('bullets', 'tree', 'mindmap', 'canvas')),
  visibility text not null default 'team' check (visibility in ('team', 'private')),
  owner_id uuid references public.profiles (id) on delete cascade default auth.uid(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_process()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists processes_touch on public.processes;
create trigger processes_touch before insert or update on public.processes
  for each row execute function public.touch_process();

alter table public.processes enable row level security;
drop policy if exists "read processes" on public.processes;
create policy "read processes" on public.processes for select to authenticated
  using (visibility = 'team' or owner_id = auth.uid());
drop policy if exists "write processes" on public.processes;
create policy "write processes" on public.processes for all to authenticated
  using (public.my_role() in ('admin', 'user') and (visibility = 'team' or owner_id = auth.uid()))
  with check (public.my_role() in ('admin', 'user') and (visibility = 'team' or owner_id = auth.uid()));

grant select, insert, update, delete on public.processes to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'processes') then
    alter publication supabase_realtime add table public.processes;
  end if;
end $$;

-- ───────── Permissions per access level (upgrade 6) ─────────

-- ───────── Visitor role ─────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user', 'basic', 'visitor'));

-- ───────── What each access level may do (admins can always do everything) ─────────
create table if not exists public.role_permissions (
  role text not null check (role in ('user', 'basic', 'visitor')),
  perm text not null,
  allowed boolean not null default false,
  primary key (role, perm)
);

-- Defaults. Existing choices are kept when this file is run again.
insert into public.role_permissions (role, perm, allowed)
select r.role, p.perm,
  case r.role
    when 'user' then true
    when 'basic' then p.perm not in ('process_edit', 'tags_manage')
    else p.perm in ('export')
  end
from (values ('user'), ('basic'), ('visitor')) r(role)
cross join (values ('task_create'), ('task_edit'), ('task_status'), ('task_delete'), ('files_upload'),
  ('checklist_tick'), ('checklist_manage'), ('meeting_edit'), ('routine_do'), ('routine_manage'),
  ('process_edit'), ('tags_manage'), ('export')) p(perm)
on conflict (role, perm) do nothing;

create or replace function public.can(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then true                         -- server (secret key) / SQL editor
    when public.my_role() = 'admin' then true
    else coalesce((select allowed from public.role_permissions where role = public.my_role() and perm = p), false)
  end;
$$;
grant execute on function public.can(text) to authenticated;

alter table public.role_permissions enable row level security;
drop policy if exists "read permissions" on public.role_permissions;
create policy "read permissions" on public.role_permissions for select to authenticated using (true);
drop policy if exists "admins change permissions" on public.role_permissions;
create policy "admins change permissions" on public.role_permissions for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
grant select, insert, update, delete on public.role_permissions to authenticated, service_role;

-- ───────── Apply the permissions to every table ─────────
-- Everyone keeps reading; writing needs the matching permission.

-- helper: replace the old "team access" policy with read + write policies
create or replace function pg_temp.split(t text, ins text, upd text, del text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists "team access" on public.%I', t);
  execute format('drop policy if exists "read" on public.%I', t);
  execute format('drop policy if exists "add" on public.%I', t);
  execute format('drop policy if exists "change" on public.%I', t);
  execute format('drop policy if exists "remove" on public.%I', t);
  execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
  execute format('create policy "add" on public.%I for insert to authenticated with check (%s)', t, ins);
  execute format('create policy "change" on public.%I for update to authenticated using (%s) with check (%s)', t, upd, upd);
  execute format('create policy "remove" on public.%I for delete to authenticated using (%s)', t, del);
end $$;

select pg_temp.split('tasks',
  $$public.can('task_create')$$,
  $$public.can('task_edit') or public.can('task_status')$$,
  $$public.can('task_delete')$$);
select pg_temp.split('task_assignees',
  $$public.can('task_edit') or public.can('task_create')$$, $$public.can('task_edit')$$, $$public.can('task_edit')$$);
select pg_temp.split('task_tags',
  $$public.can('task_edit') or public.can('task_create')$$, $$public.can('task_edit')$$, $$public.can('task_edit')$$);
select pg_temp.split('task_blockers',
  $$public.can('task_edit')$$, $$public.can('task_edit')$$, $$public.can('task_edit')$$);
select pg_temp.split('subtasks',
  $$public.can('task_edit') or public.can('task_create')$$,
  $$public.can('task_edit') or public.can('task_status')$$,
  $$public.can('task_edit')$$);
select pg_temp.split('tags',
  $$public.can('tags_manage') or public.can('task_edit') or public.can('task_create')$$,
  $$public.can('tags_manage')$$, $$public.can('tags_manage')$$);
select pg_temp.split('attachments',
  $$public.can('files_upload')$$, $$public.can('files_upload')$$, $$public.can('files_upload')$$);
select pg_temp.split('meetings',
  $$public.can('meeting_edit')$$, $$public.can('meeting_edit')$$, $$public.can('meeting_edit')$$);
select pg_temp.split('meeting_actions',
  $$public.can('meeting_edit')$$, $$public.can('meeting_edit')$$, $$public.can('meeting_edit')$$);
select pg_temp.split('meeting_tasks',
  $$public.can('meeting_edit')$$, $$public.can('meeting_edit')$$, $$public.can('meeting_edit')$$);

-- Someone who may only change the status can't touch anything else on a task.
create or replace function public.guard_task_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare free text[] := array['status', 'completed_at', 'position', 'updated_at', 'updated_by'];
begin
  if not public.can('task_edit') and (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'Your access level only allows changing the status of tasks' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tasks_guard_edit on public.tasks;
create trigger tasks_guard_edit before update on public.tasks
  for each row execute function public.guard_task_edit();

create or replace function public.guard_subtask_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.can('task_edit') and (to_jsonb(new) - 'done') is distinct from (to_jsonb(old) - 'done') then
    raise exception 'Your access level only allows ticking sub-tasks' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists subtasks_guard_edit on public.subtasks;
create trigger subtasks_guard_edit before update on public.subtasks
  for each row execute function public.guard_subtask_edit();

-- Files in storage follow the same rule as the attachments list.
drop policy if exists "team uploads attachments" on storage.objects;
create policy "team uploads attachments" on storage.objects
  for insert to authenticated with check (bucket_id = 'attachments' and public.can('files_upload'));
drop policy if exists "team deletes attachments" on storage.objects;
create policy "team deletes attachments" on storage.objects
  for delete to authenticated using (bucket_id = 'attachments' and public.can('files_upload'));

-- Checklist: items need "manage", ticks need "tick". Personal items stay private.
drop policy if exists "checklist items" on public.checklist_items;
drop policy if exists "read checklist items" on public.checklist_items;
drop policy if exists "write checklist items" on public.checklist_items;
create policy "read checklist items" on public.checklist_items for select to authenticated
  using (scope = 'team' or owner_id = auth.uid());
create policy "write checklist items" on public.checklist_items for all to authenticated
  using ((scope = 'team' or owner_id = auth.uid()) and public.can('checklist_manage'))
  with check ((scope = 'team' or owner_id = auth.uid()) and public.can('checklist_manage'));

drop policy if exists "checklist checks" on public.checklist_checks;
drop policy if exists "read checklist checks" on public.checklist_checks;
drop policy if exists "write checklist checks" on public.checklist_checks;
create policy "read checklist checks" on public.checklist_checks for select to authenticated
  using (exists (select 1 from public.checklist_items i where i.id = item_id and (i.scope = 'team' or i.owner_id = auth.uid())));
create policy "write checklist checks" on public.checklist_checks for all to authenticated
  using (public.can('checklist_tick') and exists (select 1 from public.checklist_items i where i.id = item_id and (i.scope = 'team' or i.owner_id = auth.uid())))
  with check (public.can('checklist_tick') and exists (select 1 from public.checklist_items i where i.id = item_id and (i.scope = 'team' or i.owner_id = auth.uid())));

-- Repeating reminders: creating/editing needs "manage", picking up / done needs "do".
drop policy if exists "routines" on public.routines;
drop policy if exists "read routines" on public.routines;
drop policy if exists "write routines" on public.routines;
create policy "read routines" on public.routines for select to authenticated
  using (scope = 'team' or owner_id = auth.uid());
create policy "write routines" on public.routines for all to authenticated
  using ((scope = 'team' or owner_id = auth.uid()) and public.can('routine_manage'))
  with check ((scope = 'team' or owner_id = auth.uid()) and public.can('routine_manage'));

drop policy if exists "routine runs" on public.routine_runs;
drop policy if exists "read routine runs" on public.routine_runs;
drop policy if exists "write routine runs" on public.routine_runs;
create policy "read routine runs" on public.routine_runs for select to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and (r.scope = 'team' or r.owner_id = auth.uid())));
create policy "write routine runs" on public.routine_runs for all to authenticated
  using (public.can('routine_do') and exists (select 1 from public.routines r where r.id = routine_id and (r.scope = 'team' or r.owner_id = auth.uid())))
  with check (public.can('routine_do') and exists (select 1 from public.routines r where r.id = routine_id and (r.scope = 'team' or r.owner_id = auth.uid())));

-- Processes
drop policy if exists "write processes" on public.processes;
create policy "write processes" on public.processes for all to authenticated
  using (public.can('process_edit') and (visibility = 'team' or owner_id = auth.uid()))
  with check (public.can('process_edit') and (visibility = 'team' or owner_id = auth.uid()));

-- Live updates for the permissions table
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'role_permissions') then
    alter publication supabase_realtime add table public.role_permissions;
  end if;
end $$;

-- ───────── History log (upgrade 7) ─────────

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,                 -- who did it (null = the app's server, e.g. scheduled reminders)
  actor_name text,            -- their name at the time, kept if they are removed later
  kind text not null,         -- table name, or 'export' / 'login'
  action text not null,       -- insert / update / delete / export / login
  record_id text,
  title text,                 -- what it is about, e.g. "#12 Send contract"
  parent text,                -- what it belongs to, e.g. the task of a sub-task
  changes jsonb,              -- { field: [before, after] } for edits
  details text
);
create index if not exists activity_log_at on public.activity_log (at desc);
create index if not exists activity_log_actor on public.activity_log (actor, at desc);

alter table public.activity_log enable row level security;
drop policy if exists "admins read history" on public.activity_log;
create policy "admins read history" on public.activity_log for select to authenticated
  using (public.my_role() = 'admin');
-- No insert/update/delete policies: rows are only written by the functions below, and can't be edited.
grant select on public.activity_log to authenticated;
grant all on public.activity_log to service_role;

-- Short, readable version of a value for the log.
create or replace function public.log_value(v jsonb)
returns jsonb language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb then null
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 160 then to_jsonb(left(v #>> '{}', 160) || '…')
    when jsonb_typeof(v) in ('object', 'array') and length(v::text) > 160 then to_jsonb('(changed)'::text)
    else v
  end;
$$;

create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  noise text[] := array['updated_at', 'updated_by', 'created_at', 'created_by', 'position', 'id', 'number',
                        'completed_at', 'checked_at', 'claimed_at', 'done_at'];
  diff jsonb := '{}'::jsonb;
  k text;
  t_title text;
  t_parent text;
  t_details text;
  rid text := coalesce(r ->> 'id', '');
  uid uuid := auth.uid();
begin
  -- Adding/removing people runs on the server; the server records which admin did it instead.
  if uid is null and tg_table_name = 'profiles' and tg_op <> 'UPDATE' then return null; end if;
  -- What changed (edits only)
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(r) loop
      continue when k = any(noise);
      if tg_table_name = 'profiles' and k not in ('role', 'full_name', 'email') then continue; end if;
      if (o -> k) is distinct from (r -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(public.log_value(o -> k), public.log_value(r -> k)));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;  -- only background fields moved
  end if;

  -- Human labels
  case tg_table_name
    when 'tasks' then t_title := '#' || (r ->> 'number') || ' ' || (r ->> 'title');
    when 'subtasks', 'task_assignees', 'task_tags', 'task_blockers', 'attachments' then
      select '#' || number || ' ' || title into t_parent from tasks where id = (r ->> 'task_id')::uuid;
      if t_parent is null and r ? 'meeting_id' and r ->> 'meeting_id' is not null then
        select 'Meeting: ' || title into t_parent from meetings where id = (r ->> 'meeting_id')::uuid;
      end if;
      -- The parent is being deleted too: its own entry is enough.
      if t_parent is null and tg_op = 'DELETE' then return null; end if;
      t_title := case tg_table_name
        when 'subtasks' then r ->> 'title'
        when 'task_assignees' then (select full_name from profiles where id = (r ->> 'user_id')::uuid)
        when 'task_tags' then (select name from tags where id = (r ->> 'tag_id')::uuid)
        when 'task_blockers' then (select '#' || number || ' ' || title from tasks where id = (r ->> 'blocked_by')::uuid)
        else r ->> 'name' end;
      rid := coalesce(r ->> 'task_id', r ->> 'meeting_id', rid);
    when 'meetings' then t_title := r ->> 'title';
    when 'meeting_actions', 'meeting_tasks' then
      select title into t_parent from meetings where id = (r ->> 'meeting_id')::uuid;
      if t_parent is null and tg_op = 'DELETE' then return null; end if;
      t_title := coalesce(r ->> 'text', (select '#' || number || ' ' || title from tasks where id = (r ->> 'task_id')::uuid));
      rid := r ->> 'meeting_id';
    when 'checklist_items' then t_title := r ->> 'label'; t_details := r ->> 'scope';
    when 'checklist_checks' then
      select label into t_title from checklist_items where id = (r ->> 'item_id')::uuid;
      if t_title is null and tg_op = 'DELETE' then return null; end if;
      t_details := r ->> 'day'; rid := r ->> 'item_id';
    when 'routines' then t_title := r ->> 'title'; t_details := r ->> 'scope';
    when 'routine_runs' then
      select title into t_title from routines where id = (r ->> 'routine_id')::uuid;
      if t_title is null and tg_op = 'DELETE' then return null; end if;
      t_details := r ->> 'day'; rid := r ->> 'routine_id';
    when 'processes' then t_title := r ->> 'title'; t_details := r ->> 'visibility';
    when 'tags' then t_title := r ->> 'name';
    when 'profiles' then t_title := coalesce(nullif(r ->> 'full_name', ''), r ->> 'email');
    when 'role_permissions' then t_title := (r ->> 'role') || ': ' || (r ->> 'perm'); rid := t_title;
    else t_title := coalesce(r ->> 'title', r ->> 'name', r ->> 'label');
  end case;

  insert into activity_log (actor, actor_name, kind, action, record_id, title, parent, changes, details)
  values (uid, (select full_name from profiles where id = uid), tg_table_name, lower(tg_op), rid, t_title, t_parent,
          case when tg_op = 'UPDATE' then diff
               when tg_table_name = 'routine_runs' then jsonb_build_object('claimed_by', r -> 'claimed_by', 'done_by', r -> 'done_by')
               else null end,
          t_details);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tasks', 'subtasks', 'task_assignees', 'task_tags', 'task_blockers', 'attachments',
    'meetings', 'meeting_actions', 'meeting_tasks', 'checklist_items', 'checklist_checks', 'routines', 'routine_runs',
    'processes', 'tags', 'profiles', 'role_permissions']
  loop
    execute format('drop trigger if exists zz_log_change on public.%I', t);
    execute format('create trigger zz_log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
end $$;

-- Things the database can't see by itself (exports, logins) are reported by the app.
create or replace function public.log_event(kind text, title text, details text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or kind not in ('export', 'login') then return; end if;
  insert into activity_log (actor, actor_name, kind, action, title, details)
  values (auth.uid(), (select full_name from profiles where id = auth.uid()), kind, kind, left(title, 300), left(details, 500));
end $$;
grant execute on function public.log_event(text, text, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log') then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;

-- ───────── Reminder notes & files, Word documents (upgrade 8) ─────────

-- Several separate notes per reminder (the old single note becomes the first one).
alter table public.routines add column if not exists note_list jsonb not null default '[]'::jsonb;
update public.routines set note_list = jsonb_build_array(notes)
where coalesce(notes, '') <> '' and note_list = '[]'::jsonb;

-- Files on reminders
alter table public.attachments add column if not exists routine_id uuid references public.routines (id) on delete cascade;
create index if not exists attachments_routine on public.attachments (routine_id);
alter table public.attachments drop constraint if exists attachments_check;
alter table public.attachments drop constraint if exists attachments_owner_check;
alter table public.attachments add constraint attachments_owner_check
  check (task_id is not null or meeting_id is not null or routine_id is not null);

-- Allow Word documents (and keep PDFs and images), up to 10 MB each
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/webp', 'image/jpeg', 'image/png',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  file_size_limit = 10485760
where id = 'attachments';

-- History: say which reminder a file belongs to
create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  noise text[] := array['updated_at', 'updated_by', 'created_at', 'created_by', 'position', 'id', 'number',
                        'completed_at', 'checked_at', 'claimed_at', 'done_at'];
  diff jsonb := '{}'::jsonb;
  k text;
  t_title text;
  t_parent text;
  t_details text;
  rid text := coalesce(r ->> 'id', '');
  uid uuid := auth.uid();
begin
  -- Adding/removing people runs on the server; the server records which admin did it instead.
  if uid is null and tg_table_name = 'profiles' and tg_op <> 'UPDATE' then return null; end if;
  -- What changed (edits only)
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(r) loop
      continue when k = any(noise);
      if tg_table_name = 'profiles' and k not in ('role', 'full_name', 'email') then continue; end if;
      if (o -> k) is distinct from (r -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(public.log_value(o -> k), public.log_value(r -> k)));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;  -- only background fields moved
  end if;

  -- Human labels
  case tg_table_name
    when 'tasks' then t_title := '#' || (r ->> 'number') || ' ' || (r ->> 'title');
    when 'subtasks', 'task_assignees', 'task_tags', 'task_blockers', 'attachments' then
      select '#' || number || ' ' || title into t_parent from tasks where id = (r ->> 'task_id')::uuid;
      if t_parent is null and r ? 'meeting_id' and r ->> 'meeting_id' is not null then
        select 'Meeting: ' || title into t_parent from meetings where id = (r ->> 'meeting_id')::uuid;
      end if;
      if t_parent is null and r ? 'routine_id' and r ->> 'routine_id' is not null then
        select 'Reminder: ' || title into t_parent from routines where id = (r ->> 'routine_id')::uuid;
      end if;
      -- The parent is being deleted too: its own entry is enough.
      if t_parent is null and tg_op = 'DELETE' then return null; end if;
      t_title := case tg_table_name
        when 'subtasks' then r ->> 'title'
        when 'task_assignees' then (select full_name from profiles where id = (r ->> 'user_id')::uuid)
        when 'task_tags' then (select name from tags where id = (r ->> 'tag_id')::uuid)
        when 'task_blockers' then (select '#' || number || ' ' || title from tasks where id = (r ->> 'blocked_by')::uuid)
        else r ->> 'name' end;
      rid := coalesce(r ->> 'task_id', r ->> 'meeting_id', r ->> 'routine_id', rid);
    when 'meetings' then t_title := r ->> 'title';
    when 'meeting_actions', 'meeting_tasks' then
      select title into t_parent from meetings where id = (r ->> 'meeting_id')::uuid;
      if t_parent is null and tg_op = 'DELETE' then return null; end if;
      t_title := coalesce(r ->> 'text', (select '#' || number || ' ' || title from tasks where id = (r ->> 'task_id')::uuid));
      rid := r ->> 'meeting_id';
    when 'checklist_items' then t_title := r ->> 'label'; t_details := r ->> 'scope';
    when 'checklist_checks' then
      select label into t_title from checklist_items where id = (r ->> 'item_id')::uuid;
      if t_title is null and tg_op = 'DELETE' then return null; end if;
      t_details := r ->> 'day'; rid := r ->> 'item_id';
    when 'routines' then t_title := r ->> 'title'; t_details := r ->> 'scope';
    when 'routine_runs' then
      select title into t_title from routines where id = (r ->> 'routine_id')::uuid;
      if t_title is null and tg_op = 'DELETE' then return null; end if;
      t_details := r ->> 'day'; rid := r ->> 'routine_id';
    when 'processes' then t_title := r ->> 'title'; t_details := r ->> 'visibility';
    when 'tags' then t_title := r ->> 'name';
    when 'profiles' then t_title := coalesce(nullif(r ->> 'full_name', ''), r ->> 'email');
    when 'role_permissions' then t_title := (r ->> 'role') || ': ' || (r ->> 'perm'); rid := t_title;
    else t_title := coalesce(r ->> 'title', r ->> 'name', r ->> 'label');
  end case;

  insert into activity_log (actor, actor_name, kind, action, record_id, title, parent, changes, details)
  values (uid, (select full_name from profiles where id = uid), tg_table_name, lower(tg_op), rid, t_title, t_parent,
          case when tg_op = 'UPDATE' then diff
               when tg_table_name = 'routine_runs' then jsonb_build_object('claimed_by', r -> 'claimed_by', 'done_by', r -> 'done_by')
               else null end,
          t_details);
  return null;
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

-- ───────────────────────────── API access (explicit grants) ─────────────────────────────
-- From Oct 30 2026 Supabase no longer grants API access to new tables automatically.
-- Logged-in users get access (row level security above still decides what they see);
-- the anonymous key gets nothing. app_settings is server-only.
do $$
declare t text;
begin
  foreach t in array array['profiles','tags','tasks','task_assignees','task_tags','subtasks','task_blockers',
    'meetings','meeting_actions','meeting_tasks','attachments','checklist_items','checklist_checks',
    'notifications','push_subscriptions','reminder_log','routines','routine_runs','processes']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
  if to_regclass('public.app_settings') is not null then
    execute 'grant select, insert, update, delete on public.app_settings to service_role';
  end if;
end $$;
grant usage on schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
