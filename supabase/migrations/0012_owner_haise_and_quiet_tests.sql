-- 0012: two guards.
-- 1. The CMS always keeps haise-727 (the system's owner and maintainer) as an owner, on top of
--    0011's "at least one owner". Removing or demoting haise-727 is refused by the database.
--    If ownership ever passes to someone else, a new migration changes the name below
--    (or drops the check); see docs/RECOVERY.md.
-- 2. Test applications (intake starting with 'zz-', used by the live tests) no longer send an
--    alert email, so test runs don't use up the Resend quota or fill the club inbox.

create or replace function public.admins_keep_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins where role = 'owner') then
    raise exception 'The CMS must keep at least one owner (see docs/RECOVERY.md)'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.admins where github_username = 'haise-727' and role = 'owner') then
    raise exception 'haise-727 must stay an owner of the CMS (see docs/RECOVERY.md)'
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- the trigger from 0011 already calls this function after every update or delete on admins

drop trigger if exists t_notify_new_application on public.applications;
create trigger t_notify_new_application
  after insert on public.applications
  for each row
  when (new.intake is distinct from 'pre-launch' and coalesce(new.intake, '') not like 'zz-%')
  execute function public.notify_new_application();
