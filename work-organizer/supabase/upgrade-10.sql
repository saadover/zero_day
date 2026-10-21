-- Work Organizer — upgrade 10 (fix "Database error creating new user")
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- At the end it shows one row: "Karim Benali | ok" — that means it worked.

-- "brahim.saadi101@x.com" → "Brahim Saadi"
create or replace function public.name_from_email(email text)
returns text language sql immutable as $$
  select coalesce(nullif(initcap(trim(regexp_replace(regexp_replace(split_part(email, '@', 1), '\d+', '', 'g'), '[._-]+', ' ', 'g'))), ''), split_part(email, '@', 1));
$$;

-- Create a profile for every new login (no longer needs the helper above).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  em text := coalesce(new.email, '')::text;
  guess text := coalesce(nullif(initcap(trim(regexp_replace(regexp_replace(split_part(em, '@', 1), '\d+', '', 'g'), '[._-]+', ' ', 'g'))), ''), split_part(em, '@', 1));
begin
  insert into public.profiles (id, email, full_name, must_change_password, role)
  values (
    new.id,
    em,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), guess),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'user')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Check (changes nothing): should show "Karim Benali | ok"
select public.name_from_email('karim.benali22@x.com'::varchar) as name_from_email_test,
       case when exists (select 1 from pg_proc where proname = 'handle_new_user') then 'ok' else 'missing' end as new_user_rule;
