-- 0009: publishing is one atomic step in the database.
-- WRITTEN, NOT APPLIED. Run after 0001-0006. Safe to run more than once.
--
-- Before: publish() read the newest release (for the one-minute limit), built the
-- snapshot, then inserted it. Two people pressing Publish at the same moment could
-- both pass the check and both insert, and two rebuilds would start from snapshots
-- built a moment apart.
--
-- After: publish_release() takes a transaction-level advisory lock, re-checks the
-- limit against the database clock, and inserts, all in one short transaction. The
-- second caller waits for the first to commit, sees its release, and is told how
-- long to wait. The deploy hook is still called by the CMS afterwards, outside the
-- transaction, so no lock is held during the network call.
--
-- It runs with the caller's rights (security invoker): the existing row level
-- security on releases still decides who may read and insert (role_rank() >= 3).
-- The CMS falls back to a plain insert while this function does not exist yet.

create or replace function public.publish_release(
  p_snapshot       jsonb,
  p_note           text,
  p_published_by   text,
  p_schema_version int,
  p_min_seconds    int default 60
)
returns table (release_id bigint, retry_after_seconds int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_last  timestamptz;
  v_now   timestamptz;
  v_wait  numeric;
begin
  -- one publisher at a time; released automatically at commit or rollback
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fable_cms.publish'));

  -- clock_timestamp(), not now(): now() is when this transaction began, which can be
  -- before the release we just waited for was committed
  v_now := pg_catalog.clock_timestamp();
  select r.published_at into v_last from public.releases r order by r.id desc limit 1;

  if v_last is not null then
    v_wait := p_min_seconds - extract(epoch from (v_now - v_last));
    if v_wait > 0 then
      return query select null::bigint, ceil(v_wait)::int;
      return;
    end if;
  end if;

  return query
    insert into public.releases (snapshot, note, published_by, published_at, schema_version, deploy_state)
    values (p_snapshot, p_note, p_published_by, v_now, p_schema_version, 'triggered')
    returning id, 0;
end;
$$;

comment on function public.publish_release(jsonb, text, text, int, int) is
  'Save a release unless one was published less than p_min_seconds ago; one caller at a time (advisory lock). Returns the new id, or null and the seconds to wait.';

revoke all on function public.publish_release(jsonb, text, text, int, int) from public, anon;
grant execute on function public.publish_release(jsonb, text, text, int, int) to authenticated, service_role;
