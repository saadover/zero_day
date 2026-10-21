-- Work Organizer — upgrade 11 (task status notifications in the right order)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- "started working" only when a task really starts; moving a finished task back says "reopened".

create or replace function public.notify_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; k text; what text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.created_by is null or new.created_by = auth.uid() or auth.uid() is null then return new; end if;
  if new.status = 'Done' then k := 'task_done'; what := ' completed a task';
  elsif old.status = 'Done' then k := 'task_reopened'; what := ' reopened a finished task';
  elsif new.status = 'In progress' then k := 'task_started'; what := ' started working on a task';
  else return new;
  end if;
  select coalesce(nullif(full_name, ''), email) into actor from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, kind, title, body, task_id)
  values (new.created_by, k, coalesce(actor, 'Someone') || what, '#' || new.number || ' ' || new.title, new.id);
  return new;
end $$;

drop trigger if exists tasks_notify_status on public.tasks;
create trigger tasks_notify_status after update of status on public.tasks
  for each row execute function public.notify_status();
