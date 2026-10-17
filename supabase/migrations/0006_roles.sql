-- 0006: four access levels (member < creator < admin < owner) and draft events.
-- NOT YET APPLIED. Run after 0001-0005. Safe to run more than once.
--
--   member   read applications and registrations
--   creator  + create events and edit DRAFT events, upload photos
--   admin    + manage everything (live events, members, sign-ups) and publish; not people
--   owner    + manage people, roll back, retry rebuilds
-- Each level includes everything below it. The CMS app mirrors this table (src/lib/roles.ts).

-- ============================================================ levels
alter table admins drop constraint if exists admins_role_check;
update admins set role = 'admin' where role = 'editor';        -- the old name
alter table admins add constraint admins_role_check check (role in ('member', 'creator', 'admin', 'owner'));

-- The caller's level as a number (0 = not allowed in). Reads the GitHub username from
-- auth.identities (set by GitHub, not editable by the user), never from user_metadata.
create or replace function public.role_rank() returns int
language sql stable security definer set search_path = public, auth as $$
  select coalesce(max(case a.role when 'member' then 1 when 'creator' then 2 when 'admin' then 3 when 'owner' then 4 end), 0)
  from auth.identities i
  join public.admins a on a.github_username = lower(i.identity_data ->> 'user_name')
  where i.user_id = auth.uid() and i.provider = 'github'
$$;
revoke all on function public.role_rank() from public, anon;
grant execute on function public.role_rank() to authenticated;

-- Older helpers keep working (anyone with a level / owners).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$ select public.role_rank() >= 1 $$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public, auth as $$ select public.role_rank() >= 4 $$;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- ============================================================ drafts
-- A draft is saved but never published. Existing events stay live (default false).
alter table events add column if not exists draft boolean not null default false;

-- ============================================================ policies
-- helper to replace every old policy on a table
do $$
declare t text; p record;
begin
  foreach t in array array['events','members','aims','club_settings','media','releases','audit_log','admins','applications','registrations'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and policyname <> 'public_insert' and policyname <> 'public_latest_release' loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- events: creators write drafts only; admins write everything
create policy events_read   on events for select to authenticated using (role_rank() >= 2);
create policy events_insert on events for insert to authenticated with check (role_rank() >= 3 or (role_rank() = 2 and draft));
create policy events_update on events for update to authenticated
  using (role_rank() >= 3 or (role_rank() = 2 and draft))
  with check (role_rank() >= 3 or (role_rank() = 2 and draft));
create policy events_delete on events for delete to authenticated using (role_rank() >= 3 or (role_rank() = 2 and draft));

-- members, aims, club settings: admins and owners
create policy staff_all on members       for all to authenticated using (role_rank() >= 3) with check (role_rank() >= 3);
create policy staff_all on aims          for all to authenticated using (role_rank() >= 3) with check (role_rank() >= 3);
create policy staff_all on club_settings for all to authenticated using (role_rank() >= 3) with check (role_rank() >= 3);

-- media records: creators upload photos for their drafts
create policy creator_all on media for all to authenticated using (role_rank() >= 2) with check (role_rank() >= 2);

-- releases: admins publish and look at history; the public read policy from 0003 stays
create policy staff_read   on releases for select to authenticated using (role_rank() >= 3);
create policy staff_insert on releases for insert to authenticated with check (role_rank() >= 3);
create policy staff_update on releases for update to authenticated using (role_rank() >= 3) with check (role_rank() >= 3);

create policy staff_read   on audit_log for select to authenticated using (role_rank() >= 3);
create policy staff_insert on audit_log for insert to authenticated with check (role_rank() >= 3);

-- people: only owners read or change the list
create policy owner_all on admins for all to authenticated using (role_rank() >= 4) with check (role_rank() >= 4);

-- sign-ups: any level reads; admins triage (status, notes) and clean up. The public insert policies stay.
create policy staff_read   on applications for select to authenticated using (role_rank() >= 1);
create policy admin_update on applications for update to authenticated using (role_rank() >= 3) with check (role_rank() >= 3);
create policy admin_delete on applications for delete to authenticated using (role_rank() >= 3);
create policy staff_read   on registrations for select to authenticated using (role_rank() >= 1);
create policy admin_update on registrations for update to authenticated using (role_rank() >= 3) with check (role_rank() >= 3);
create policy admin_delete on registrations for delete to authenticated using (role_rank() >= 3);

-- ============================================================ photo storage
drop policy if exists media_admin_write  on storage.objects;
drop policy if exists media_admin_update on storage.objects;
drop policy if exists media_admin_delete on storage.objects;
create policy media_creator_write  on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.role_rank() >= 2);
create policy media_creator_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.role_rank() >= 2);
create policy media_admin_delete   on storage.objects for delete to authenticated using (bucket_id = 'media' and public.role_rank() >= 3);
