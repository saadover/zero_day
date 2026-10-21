-- Work Organizer — upgrade 9 (tell the task's creator when someone starts or finishes it)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

create or replace function public.notify_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  if new.status is not distinct from old.status or new.status not in ('In progress', 'Done') then return new; end if;
  -- Nobody to tell, or you changed your own task
  if new.created_by is null or new.created_by = auth.uid() or auth.uid() is null then return new; end if;
  select coalesce(nullif(full_name, ''), email) into actor from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, kind, title, body, task_id)
  values (new.created_by,
          case when new.status = 'Done' then 'task_done' else 'task_started' end,
          coalesce(actor, 'Someone') || case when new.status = 'Done' then ' completed a task' else ' started working on a task' end,
          '#' || new.number || ' ' || new.title, new.id);
  return new;
end $$;

drop trigger if exists tasks_notify_status on public.tasks;
create trigger tasks_notify_status after update of status on public.tasks
  for each row execute function public.notify_status();
