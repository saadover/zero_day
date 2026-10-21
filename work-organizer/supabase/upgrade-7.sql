-- Work Organizer — upgrade 7 (History: a log of every change, visible to admins only)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Needs upgrade-5 and upgrade-6 first.

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
