-- Work Organizer — upgrade 4 (recurring reminders)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

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
