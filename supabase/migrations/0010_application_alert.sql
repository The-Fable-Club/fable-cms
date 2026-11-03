-- 0010: email the club for each new application.
-- After an application is saved, the database POSTs the row to the CMS
-- (/api/hooks/new-application), which emails contact@thefableclub.com through Resend.
--
-- pg_net sends the request in the background, after the insert commits, so a slow or
-- failed CMS never blocks or fails an application. Results land in net._http_response.
--
-- The shared secret is NOT in this file (the repo is public). Store it once, by hand:
--   select vault.create_secret('<secret>', 'application_hook_secret');
-- and put the same value in the CMS environment as APPLICATION_HOOK_SECRET.
-- Without the vault secret the trigger does nothing.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
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
  -- never lose an application over an alert
  raise warning 'notify_new_application: %', sqlerrm;
  return new;
end $$;

revoke all on function public.notify_new_application() from public, anon, authenticated;

drop trigger if exists t_notify_new_application on public.applications;
create trigger t_notify_new_application
  after insert on public.applications
  for each row
  when (new.intake is distinct from 'pre-launch')
  execute function public.notify_new_application();
