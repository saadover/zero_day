-- Work Organizer — upgrade 5 (roles + processes)
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

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
