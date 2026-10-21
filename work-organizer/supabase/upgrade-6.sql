-- Work Organizer — upgrade 6 (permissions per access level + "Visitor")
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Needs upgrade-5 first.

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
