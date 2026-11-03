-- 0013: database hardening (defence in depth). Nothing here changes what the CMS or the site can do.
-- 1. Table privileges: the public role keeps exactly what it uses (read the newest release, insert
--    applications, registrations and questions); signed-in users keep select/insert/update/delete,
--    which row level security then narrows. TRUNCATE, TRIGGER and REFERENCES go: TRUNCATE in
--    particular is not covered by row level security. New tables start without them too.
-- 2. (pg_net's schema `net` is owned by Supabase's own admin role, which grants it to everyone; we
--    can't revoke that. It stays safe because the API doesn't expose `net`: keep it out of
--    Settings -> API -> Exposed schemas. tests/live/hardening.live.test.ts checks this.)
-- 3. set_updated_at() gets a fixed search_path like every other function.
-- 4. The media bucket accepts raster images only (the CMS converts uploads to WebP anyway).
-- 5. Alert emails are capped: at most 10 an hour and 50 a day. Applications past the cap are still
--    saved and shown in the CMS; only the email is skipped. This keeps a burst of submissions from
--    using up the email plan or flooding the inbox.

-- 1. table privileges ---------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- the public role touches none of these directly
revoke all on public.admins, public.aims, public.audit_log, public.club_settings, public.events, public.media, public.members from anon;
-- the newest release is read through this view; nothing else
revoke insert, update, delete on public.public_release from anon, authenticated;

alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- 3. search_path ---------------------------------------------------------------------------
alter function public.set_updated_at() set search_path = '';

-- 4. uploads -----------------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'] where id = 'media';

-- 5. alert email cap ------------------------------------------------------------------------------
create or replace function public.notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  last_hour int;
  last_day int;
begin
  select count(*) filter (where a.created_at > now() - interval '1 hour'), count(*)
    into last_hour, last_day
    from public.applications a
   where a.created_at > now() - interval '1 day'
     and a.intake is distinct from 'pre-launch'
     and coalesce(a.intake, '') not like 'zz-%';
  if last_hour > 10 or last_day > 50 then
    return new; -- saved and visible in the CMS; just no email
  end if;

  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'application_hook_secret'
   limit 1;
  if secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://cms.thefableclub.com/api/hooks/new-application',
    body := to_jsonb(new) - 'notes' - 'status',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', secret),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  raise warning 'notify_new_application: %', sqlerrm;
  return new;
end $$;

revoke all on function public.notify_new_application() from public, anon, authenticated;
