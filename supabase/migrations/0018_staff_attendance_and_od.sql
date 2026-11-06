-- 0018: staff attendance, OD time slots, manual override, and non-VIT college support.
-- Safe to run more than once.

-- 1. Add approved OD slots to events
alter table public.events
  add column if not exists od_slots jsonb not null default '[]'::jsonb;

-- 2. Add college, od_slots, and manual override to attendance_roster
alter table public.attendance_roster
  add column if not exists college text default 'VIT Chennai',
  add column if not exists od_slots jsonb not null default '[]'::jsonb,
  add column if not exists od_override boolean not null default false,
  add column if not exists od_override_reason text;

-- Add created_at compatibility alias to attendance_marks if queried
alter table public.attendance_marks
  add column if not exists created_at timestamptz default now();

-- Relax reg_no check on attendance_roster to allow non-VIT college registrations
do $$
declare r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.attendance_roster'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%reg_no%'
  ) loop
    execute format('alter table public.attendance_roster drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.attendance_roster
  add constraint attendance_roster_reg_no_check 
  check (char_length(btrim(reg_no)) between 2 and 50);

-- Drop obsolete OTP / self-check-in functions
drop function if exists public.mark_attendance(text, text, text, text);
drop function if exists public.get_checkpoint_code(bigint);

-- Drop obsolete device token indexes and columns if existing
drop index if exists public.idx_roster_device;
alter table public.attendance_roster drop column if exists device_token;
alter table public.attendance_checkpoints drop column if exists code_secret;
alter table public.attendance_marks drop column if exists device_token;

-- Fast index for autocomplete / search by registration number or name
create index if not exists idx_roster_reg_search on public.attendance_roster (event_id, reg_no);
create index if not exists idx_roster_name_search on public.attendance_roster (event_id, name);

-- Stored procedure for staff recording attendance and setting student OD slots
create or replace function public.staff_record_attendance(
  p_roster_id bigint,
  p_checkpoint_id bigint,
  p_od_slots jsonb default null,
  p_actor text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_roster public.attendance_roster%rowtype;
  v_chk public.attendance_checkpoints%rowtype;
  v_actor text;
begin
  if public.role_rank() < 1 then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized. Staff role required.');
  end if;

  select * into v_roster from public.attendance_roster where id = p_roster_id;
  if v_roster.id is null then
    return jsonb_build_object('ok', false, 'message', 'Student not found in roster.');
  end if;

  select * into v_chk from public.attendance_checkpoints where id = p_checkpoint_id and event_id = v_roster.event_id;
  if v_chk.id is null then
    return jsonb_build_object('ok', false, 'message', 'Checkpoint not found for this event.');
  end if;

  v_actor := coalesce(p_actor, auth.jwt() ->> 'user_name', 'staff');

  -- Record mark
  insert into public.attendance_marks (roster_id, checkpoint_id, method, verified_by, marked_at)
  values (v_roster.id, v_chk.id, 'volunteer_scan', v_actor, now())
  on conflict (roster_id, checkpoint_id) do update 
    set verified_by = v_actor, marked_at = now();

  -- Update student OD slots if provided
  if p_od_slots is not null then
    update public.attendance_roster set od_slots = p_od_slots where id = v_roster.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', format('Marked %s (%s) for %s.', v_roster.name, v_roster.reg_no, v_chk.title),
    'student', jsonb_build_object(
      'id', v_roster.id,
      'reg_no', v_roster.reg_no,
      'name', v_roster.name,
      'department', v_roster.department,
      'college', v_roster.college
    )
  );
end $$;

revoke all on function public.staff_record_attendance(bigint, bigint, jsonb, text) from public, anon;
grant execute on function public.staff_record_attendance(bigint, bigint, jsonb, text) to authenticated;

-- Stored procedure for manual OD override
create or replace function public.toggle_od_override(
  p_roster_id bigint,
  p_override boolean,
  p_reason text default null,
  p_actor text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_roster public.attendance_roster%rowtype;
  v_actor text;
begin
  if public.role_rank() < 2 then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized. Creator role or higher required.');
  end if;

  select * into v_roster from public.attendance_roster where id = p_roster_id;
  if v_roster.id is null then
    return jsonb_build_object('ok', false, 'message', 'Student not found.');
  end if;

  v_actor := coalesce(p_actor, auth.jwt() ->> 'user_name', 'staff');

  update public.attendance_roster
  set od_override = p_override,
      od_override_reason = case when p_override then coalesce(p_reason, 'Manual override by ' || v_actor) else null end
  where id = p_roster_id;

  return jsonb_build_object(
    'ok', true,
    'message', case when p_override then format('OD granted to %s (%s).', v_roster.name, v_roster.reg_no) else format('OD override removed for %s.', v_roster.name) end
  );
end $$;

revoke all on function public.toggle_od_override(bigint, boolean, text, text) from public, anon;
grant execute on function public.toggle_od_override(bigint, boolean, text, text) to authenticated;
