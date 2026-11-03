-- 0011: the database refuses any change that would leave the CMS with no owner.
-- The People screen already protects the last owner, but a SQL mistake, a script or a bug
-- could still empty the admins table and lock everyone out. Now the statement fails instead.
-- Checked once per statement, after it ran, so swapping owners inside one statement is fine.
--
-- On purpose: to empty the table deliberately, an owner runs
--   alter table public.admins disable trigger t_admins_keep_owner;
-- does the change, and enables it again. See docs/RECOVERY.md.

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
  return null;
end $$;

revoke all on function public.admins_keep_owner() from public, anon, authenticated;

drop trigger if exists t_admins_keep_owner on public.admins;
create trigger t_admins_keep_owner
  after update or delete on public.admins
  for each statement
  execute function public.admins_keep_owner();

-- TRUNCATE skips row triggers and would empty the table in one go: refuse it outright.
create or replace function public.admins_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Truncating admins is not allowed (see docs/RECOVERY.md)';
end $$;

revoke all on function public.admins_no_truncate() from public, anon, authenticated;

drop trigger if exists t_admins_no_truncate on public.admins;
create trigger t_admins_no_truncate
  before truncate on public.admins
  for each statement
  execute function public.admins_no_truncate();
