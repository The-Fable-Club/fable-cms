-- 0005: fix the sign-up abuse limits. Safe to run more than once.
--
-- Found by the live tests: after 0004 took SELECT away from the public role, the
-- per-person / flood limits (which COUNT existing rows) ran with the visitor's
-- rights, so EVERY insert failed with "permission denied" (42501).
-- The limit functions now run with the table owner's rights. They only count and
-- raise an error; they never return data, so this does not expose any rows.

create or replace function public.limit_registrations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from registrations where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too many registrations for this email' using errcode = 'P0001';
  end if;
  if (select count(*) from registrations where created_at > now() - interval '1 hour') >= 500 then
    raise exception 'registrations are temporarily busy' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.limit_applications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from applications where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too many applications for this email' using errcode = 'P0001';
  end if;
  if (select count(*) from applications where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'applications are temporarily busy' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Trigger functions are never called directly.
revoke all on function public.limit_registrations() from public, anon, authenticated;
revoke all on function public.limit_applications() from public, anon, authenticated;
