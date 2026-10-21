-- Work Organizer — upgrade 8 (reminders: several notes + files; Word documents allowed everywhere)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Needs upgrade-7 first.

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
