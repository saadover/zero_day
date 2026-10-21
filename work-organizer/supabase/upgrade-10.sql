-- Work Organizer — upgrade 10 (fix "Database error creating new user")
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Adds the helper that turns an email into a default name; databases created
-- before it was added to schema.sql didn't have it, so new logins failed.

-- "brahim.saadi101@x.com" → "Brahim Saadi"
create or replace function public.name_from_email(email text)
returns text language sql immutable as $$
  select coalesce(nullif(initcap(trim(regexp_replace(regexp_replace(split_part(email, '@', 1), '\d+', '', 'g'), '[._-]+', ' ', 'g'))), ''), split_part(email, '@', 1));
$$;
