-- 0003: fix Supabase advisor "Security Definer View: public.public_release" (CRITICAL).
-- NOT YET APPLIED. Run AFTER 0002 (it needs releases.schema_version). Safe to run more than once.
--
-- Before: public_release was a security-definer view, so it ran with the table
-- owner's rights and bypassed row level security on `releases`.
-- After:  the view runs as the caller (security_invoker), and the PUBLIC may
--         read only the newest release, and only the columns the site needs,
--         enforced by row level security plus column grants on the table itself.

-- 1. Id of the newest release. Runs as the owner so the policy below can use it
--    without recursing into its own table.
create or replace function public.latest_release_id() returns bigint
language sql stable security definer set search_path = public as $$
  select max(id) from public.releases
$$;
revoke all on function public.latest_release_id() from public;
grant execute on function public.latest_release_id() to anon, authenticated;

-- 2. The public may read only the newest release row...
drop policy if exists public_latest_release on public.releases;
create policy public_latest_release on public.releases
  for select to anon using (id = public.latest_release_id());

--    ...and only these columns (never published_by, note or deploy_state).
revoke all on public.releases from anon;
grant select (id, snapshot, published_at, schema_version) on public.releases to anon;

-- 3. Rebuild the view as security invoker, so the policy and grants above apply.
drop view if exists public.public_release;
create view public.public_release with (security_invoker = true) as
  select id, snapshot, published_at, schema_version
  from public.releases
  order by id desc
  limit 1;
grant select on public.public_release to anon;

-- 4. Hardening: the admin helper functions are only for signed-in users.
--    (Policies for the anon role never call them.)
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;
