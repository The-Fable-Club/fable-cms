-- 0019: attendance and OD are admin work; the actor is always the signed-in user (fable-cms#33 review).
-- Marking someone present and setting their OD slots feeds an official university OD request, so
-- only admins (rank 3+) may do it, the same level that already manages the roster and checkpoints.
-- The functions no longer take the actor's name from the caller: it comes from the signed-in
-- user's GitHub identity (set by the provider, not editable by the user), exactly as role_rank()
-- finds the user, so the audit trail can't be forged. Safe to run more than once.

-- the signed-in user's GitHub username (null if none)
create or replace function public.current_github_username()
returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(i.identity_data ->> 'user_name')
  from auth.identities i
  where i.user_id = auth.uid() and i.provider = 'github'
  limit 1
$$;
revoke all on function public.current_github_username() from public, anon;
grant execute on function public.current_github_username() to authenticated;

-- members could insert marks directly; admins already have admin_write_marks
drop policy if exists volunteer_insert_marks on public.attendance_marks;

-- left over from 0017 and unused: let any staff member mark anyone
drop function if exists public.volunteer_verify_student(bigint, bigint);

-- the old signatures took p_actor from the caller
drop function if exists public.staff_record_attendance(bigint, bigint, jsonb, text);
drop function if exists public.toggle_od_override(bigint, boolean, text, text);

create or replace function public.staff_record_attendance(
  p_roster_id bigint,
  p_checkpoint_id bigint,
  p_od_slots jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_roster public.attendance_roster%rowtype;
  v_chk public.attendance_checkpoints%rowtype;
  v_actor text := coalesce(public.current_github_username(), 'unknown');
begin
  if public.role_rank() < 3 then
    return jsonb_build_object('ok', false, 'message', 'Only admins can take attendance.');
  end if;

  select * into v_roster from public.attendance_roster where id = p_roster_id;
  if v_roster.id is null then
    return jsonb_build_object('ok', false, 'message', 'Student not found in roster.');
  end if;

  select * into v_chk from public.attendance_checkpoints where id = p_checkpoint_id and event_id = v_roster.event_id;
  if v_chk.id is null then
    return jsonb_build_object('ok', false, 'message', 'Checkpoint not found for this event.');
  end if;

  insert into public.attendance_marks (roster_id, checkpoint_id, method, verified_by, marked_at)
  values (v_roster.id, v_chk.id, 'volunteer_scan', v_actor, now())
  on conflict (roster_id, checkpoint_id) do update set verified_by = v_actor, marked_at = now();

  if p_od_slots is not null then
    update public.attendance_roster set od_slots = p_od_slots where id = v_roster.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', format('Marked %s (%s) for %s.', v_roster.name, v_roster.reg_no, v_chk.title),
    'student', jsonb_build_object('id', v_roster.id, 'reg_no', v_roster.reg_no, 'name', v_roster.name, 'department', v_roster.department, 'college', v_roster.college)
  );
end $$;
revoke all on function public.staff_record_attendance(bigint, bigint, jsonb) from public, anon;
grant execute on function public.staff_record_attendance(bigint, bigint, jsonb) to authenticated;

create or replace function public.toggle_od_override(
  p_roster_id bigint,
  p_override boolean,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_roster public.attendance_roster%rowtype;
  v_actor text := coalesce(public.current_github_username(), 'unknown');
begin
  if public.role_rank() < 3 then
    return jsonb_build_object('ok', false, 'message', 'Only admins can grant or remove an OD override.');
  end if;

  select * into v_roster from public.attendance_roster where id = p_roster_id;
  if v_roster.id is null then
    return jsonb_build_object('ok', false, 'message', 'Student not found.');
  end if;

  update public.attendance_roster
  set od_override = p_override,
      od_override_reason = case when p_override then coalesce(nullif(btrim(p_reason), ''), 'Manual override') || ' (by ' || v_actor || ')' else null end
  where id = p_roster_id;

  insert into public.audit_log (actor, entity, entity_id, action, detail)
  values (v_actor, 'attendance_roster', v_roster.id::text, case when p_override then 'od_override_on' else 'od_override_off' end,
          jsonb_build_object('reg_no', v_roster.reg_no, 'reason', p_reason));

  return jsonb_build_object(
    'ok', true,
    'message', case when p_override then format('OD granted to %s (%s).', v_roster.name, v_roster.reg_no) else format('OD override removed for %s.', v_roster.name) end
  );
end $$;
revoke all on function public.toggle_od_override(bigint, boolean, text) from public, anon;
grant execute on function public.toggle_od_override(bigint, boolean, text) to authenticated;
