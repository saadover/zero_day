-- Work Organizer — upgrade 13 (Knowledge base: questions & answers with files, searchable)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

create table if not exists public.knowledge (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null default '',
  tags text[] not null default '{}',
  source text not null default '',          -- e.g. "BDM in the Teams group"
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_knowledge()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists knowledge_touch on public.knowledge;
create trigger knowledge_touch before insert or update on public.knowledge
  for each row execute function public.touch_knowledge();

-- Files (screenshots, PDFs, Word) on knowledge entries
alter table public.attachments add column if not exists knowledge_id uuid references public.knowledge (id) on delete cascade;
create index if not exists attachments_knowledge on public.attachments (knowledge_id);
alter table public.attachments drop constraint if exists attachments_check;
alter table public.attachments drop constraint if exists attachments_owner_check;
alter table public.attachments add constraint attachments_owner_check
  check (task_id is not null or meeting_id is not null or routine_id is not null or knowledge_id is not null);

-- Who may add / edit / delete entries (everyone reads). Admin always may.
insert into public.role_permissions (role, perm, allowed)
values ('user', 'knowledge_edit', true), ('basic', 'knowledge_edit', true), ('visitor', 'knowledge_edit', false)
on conflict (role, perm) do nothing;

alter table public.knowledge enable row level security;
drop policy if exists "read knowledge" on public.knowledge;
create policy "read knowledge" on public.knowledge for select to authenticated using (true);
drop policy if exists "write knowledge" on public.knowledge;
create policy "write knowledge" on public.knowledge for all to authenticated
  using (public.can('knowledge_edit')) with check (public.can('knowledge_edit'));
grant select, insert, update, delete on public.knowledge to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'knowledge') then
    alter publication supabase_realtime add table public.knowledge;
  end if;
end $$;

-- History: record knowledge changes too
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
      if t_parent is null and r ? 'knowledge_id' and r ->> 'knowledge_id' is not null then
        select 'Knowledge: ' || question into t_parent from knowledge where id = (r ->> 'knowledge_id')::uuid;
      end if;
      -- The parent is being deleted too: its own entry is enough.
      if t_parent is null and tg_op = 'DELETE' then return null; end if;
      t_title := case tg_table_name
        when 'subtasks' then r ->> 'title'
        when 'task_assignees' then (select full_name from profiles where id = (r ->> 'user_id')::uuid)
        when 'task_tags' then (select name from tags where id = (r ->> 'tag_id')::uuid)
        when 'task_blockers' then (select '#' || number || ' ' || title from tasks where id = (r ->> 'blocked_by')::uuid)
        else r ->> 'name' end;
      rid := coalesce(r ->> 'task_id', r ->> 'meeting_id', r ->> 'routine_id', r ->> 'knowledge_id', rid);
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
    when 'knowledge' then t_title := left(r ->> 'question', 200);
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

drop trigger if exists zz_log_change on public.knowledge;
create trigger zz_log_change after insert or update or delete on public.knowledge
  for each row execute function public.log_change();
