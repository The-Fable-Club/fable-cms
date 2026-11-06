-- 0009: event attendance system (EventHub roster, checkpoints, rolling OTP, device binding, OD).
-- Plans: docs/ATTENDANCE-FEASIBILITY.md, fable-cms#28. Safe to run more than once.

-- ============================================================ 1. ATTENDANCE ROSTER
create table if not exists public.attendance_roster (
  id             bigint generated always as identity primary key,
  event_id       bigint not null references public.events(id) on delete cascade,
  reg_no         text not null check (reg_no ~ '^\d{2}[A-Z]{3}\d{4,5}$'),
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  email          text check (email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200)),
  phone          text check (phone is null or char_length(phone) <= 30),
  department     text check (department is null or char_length(department) <= 120),
  year           text check (year is null or char_length(year) <= 30),
  college        text check (college is null or char_length(college) <= 120),
  college_type   text check (college_type is null or char_length(college_type) <= 40),
  payment_status text check (payment_status is null or char_length(payment_status) <= 60),
  team_id        text check (team_id is null or char_length(team_id) <= 60),
  source         text not null check (source in ('eventhub', 'onspot')),
  flagged        boolean not null default false,      -- true if missing in subsequent EventHub CSV imports
  device_token   text,                                 -- bound on first self-attendance mark
  imported_at    timestamptz not null default now(),
  imported_by    text not null,                       -- staff username or 'system'
  created_at     timestamptz not null default now(),
  constraint uq_event_roster_reg unique (event_id, reg_no)
);

create index if not exists idx_roster_event_reg on public.attendance_roster(event_id, reg_no);
create index if not exists idx_roster_device on public.attendance_roster(event_id, device_token);

-- ============================================================ 2. ATTENDANCE CHECKPOINTS
create table if not exists public.attendance_checkpoints (
  id            bigint generated always as identity primary key,
  event_id      bigint not null references public.events(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 1 and 80),
  opens_at      timestamptz not null,
  closes_at     timestamptz not null,
  needed_for_od boolean not null default true,
  code_secret   text not null default md5(random()::text || clock_timestamp()::text),
  created_at    timestamptz not null default now(),
  constraint ck_checkpoint_times check (closes_at > opens_at)
);

create index if not exists idx_checkpoints_event on public.attendance_checkpoints(event_id, opens_at, closes_at);

-- ============================================================ 3. ATTENDANCE MARKS
create table if not exists public.attendance_marks (
  id            bigint generated always as identity primary key,
  roster_id     bigint not null references public.attendance_roster(id) on delete cascade,
  checkpoint_id bigint not null references public.attendance_checkpoints(id) on delete cascade,
  marked_at     timestamptz not null default now(),
  method        text not null check (method in ('student_code', 'volunteer_scan', 'spot_check')),
  device_token  text,
  verified_by   text,                               -- volunteer username if verified at door
  constraint uq_roster_checkpoint unique (roster_id, checkpoint_id)
);

create index if not exists idx_marks_roster on public.attendance_marks(roster_id);
create index if not exists idx_marks_checkpoint on public.attendance_marks(checkpoint_id);

-- ============================================================ 4. ROW LEVEL SECURITY
alter table public.attendance_roster      enable row level security;
alter table public.attendance_checkpoints enable row level security;
alter table public.attendance_marks       enable row level security;

-- Drop previous policies if re-running
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('attendance_roster', 'attendance_checkpoints', 'attendance_marks') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Roster: staff read (rank 1); admins manage (rank 3)
create policy staff_read_roster on public.attendance_roster for select to authenticated using (public.role_rank() >= 1);
create policy admin_write_roster on public.attendance_roster for all to authenticated using (public.role_rank() >= 3) with check (public.role_rank() >= 3);

-- Checkpoints: staff read (rank 1); admins manage (rank 3)
create policy staff_read_checkpoints on public.attendance_checkpoints for select to authenticated using (public.role_rank() >= 1);
create policy admin_write_checkpoints on public.attendance_checkpoints for all to authenticated using (public.role_rank() >= 3) with check (public.role_rank() >= 3);

-- Marks: staff read (rank 1); volunteers write door checks (rank 1); admins manage all (rank 3)
create policy staff_read_marks on public.attendance_marks for select to authenticated using (public.role_rank() >= 1);
create policy volunteer_insert_marks on public.attendance_marks for insert to authenticated with check (public.role_rank() >= 1);
create policy admin_write_marks on public.attendance_marks for all to authenticated using (public.role_rank() >= 3) with check (public.role_rank() >= 3);

-- Public anon has ZERO direct table read/write access to any attendance table
revoke all on public.attendance_roster from public, anon;
revoke all on public.attendance_checkpoints from public, anon;
revoke all on public.attendance_marks from public, anon;

-- ============================================================ 5. ATOMIC STORED PROCEDURES

-- Get live 6-digit rolling code for CMS presenter screen (accessible by staff rank >= 1)
create or replace function public.get_checkpoint_code(p_checkpoint_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_chk public.attendance_checkpoints%rowtype;
  v_epoch bigint;
  v_step bigint;
  v_code text;
  v_rem int;
begin
  if public.role_rank() < 1 then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized.');
  end if;

  select * into v_chk from public.attendance_checkpoints where id = p_checkpoint_id;
  if v_chk.id is null then
    return jsonb_build_object('ok', false, 'message', 'Checkpoint not found.');
  end if;

  v_epoch := extract(epoch from now())::bigint;
  v_step := v_epoch / 20;
  v_rem := 20 - (v_epoch % 20)::int;
  v_code := lpad((('x' || substr(md5(v_chk.code_secret || ':' || v_step::text), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'seconds_remaining', v_rem,
    'title', v_chk.title,
    'opens_at', v_chk.opens_at,
    'closes_at', v_chk.closes_at,
    'is_open', now() between v_chk.opens_at and v_chk.closes_at
  );
end $$;

revoke all on function public.get_checkpoint_code(bigint) from public, anon;
grant execute on function public.get_checkpoint_code(bigint) to authenticated;

-- Student self-attendance check-in (publicly callable via RPC, atomic with FOR UPDATE lock)
create or replace function public.mark_attendance(
  p_event_slug text,
  p_reg_no text,
  p_code text,
  p_device_token text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event_id bigint;
  v_roster public.attendance_roster%rowtype;
  v_chk public.attendance_checkpoints%rowtype;
  v_step bigint;
  v_code_now text;
  v_code_prev text;
  v_clean_reg text;
  v_clean_code text;
  v_clean_dev text;
begin
  v_clean_reg := upper(trim(p_reg_no));
  v_clean_code := trim(p_code);
  v_clean_dev := trim(p_device_token);

  if v_clean_reg !~ '^\d{2}[A-Z]{3}\d{4,5}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_reg', 'message', 'Enter a valid VIT registration number.');
  end if;
  if v_clean_code !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_code', 'message', 'Enter a 6-digit code.');
  end if;
  if length(v_clean_dev) < 10 then
    return jsonb_build_object('ok', false, 'code', 'invalid_device', 'message', 'Invalid device identifier.');
  end if;

  -- 1. Find live event
  select id into v_event_id from public.events where slug = p_event_slug and not archived;
  if v_event_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Event not found.');
  end if;

  -- 2. Find currently open checkpoint for this event
  select * into v_chk from public.attendance_checkpoints
  where event_id = v_event_id and now() between opens_at and closes_at
  order by opens_at asc limit 1;

  if v_chk.id is null then
    return jsonb_build_object('ok', false, 'code', 'closed', 'message', 'Attendance is not open for this event right now.');
  end if;

  -- 3. Verify rolling code (current 20s step or previous step for 20-40s drift leeway)
  v_step := extract(epoch from now())::bigint / 20;
  v_code_now  := lpad((('x' || substr(md5(v_chk.code_secret || ':' || v_step::text), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  v_code_prev := lpad((('x' || substr(md5(v_chk.code_secret || ':' || (v_step - 1)::text), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');

  if v_clean_code <> v_code_now and v_clean_code <> v_code_prev then
    return jsonb_build_object('ok', false, 'code', 'invalid_code', 'message', 'Invalid or expired code. Please check the screen.');
  end if;

  -- 4. Find student in roster (FOR UPDATE serializes concurrent requests and stops race conditions)
  select * into v_roster from public.attendance_roster
  where event_id = v_event_id and reg_no = v_clean_reg
  for update;

  if v_roster.id is null then
    return jsonb_build_object('ok', false, 'code', 'not_registered', 'message', 'You are not in the registered roster. See staff at the venue.');
  end if;

  -- 5. Anti-Proxy: Check if device is already registered to someone else in this event
  if exists (
    select 1 from public.attendance_roster
    where event_id = v_event_id and device_token = v_clean_dev and id <> v_roster.id
  ) then
    return jsonb_build_object('ok', false, 'code', 'device_shared', 'message', 'This device has already marked attendance for another student.');
  end if;

  -- Enforce 1-device binding for this student
  if v_roster.device_token is null then
    -- Bind this device token to the student on their first mark
    update public.attendance_roster set device_token = v_clean_dev where id = v_roster.id;
  elsif v_roster.device_token <> v_clean_dev then
    return jsonb_build_object('ok', false, 'code', 'device_mismatch', 'message', 'Your registration is bound to a different device.');
  end if;

  -- 6. Insert mark (unique constraint prevents double-marking)
  insert into public.attendance_marks (roster_id, checkpoint_id, method, device_token)
  values (v_roster.id, v_chk.id, 'student_code', v_clean_dev)
  on conflict (roster_id, checkpoint_id) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'already_marked', 'message', 'You have already checked in for this checkpoint.');
  end if;

  return jsonb_build_object('ok', true, 'message', format('Marked present for %s.', v_chk.title));
end $$;

revoke all on function public.mark_attendance(text, text, text, text) from public;
grant execute on function public.mark_attendance(text, text, text, text) to anon, authenticated;

-- Volunteer door scan / manual ID verification
create or replace function public.volunteer_verify_student(p_roster_id bigint, p_checkpoint_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_chk_id bigint;
  v_roster public.attendance_roster%rowtype;
begin
  if public.role_rank() < 1 then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized.');
  end if;

  select * into v_roster from public.attendance_roster where id = p_roster_id;
  if v_roster.id is null then
    return jsonb_build_object('ok', false, 'message', 'Student not found in roster.');
  end if;

  v_actor := coalesce(auth.jwt() ->> 'user_name', 'volunteer');

  -- If checkpoint given, use it; otherwise pick first/earliest checkpoint for event
  if p_checkpoint_id is not null then
    v_chk_id := p_checkpoint_id;
  else
    select id into v_chk_id from public.attendance_checkpoints where event_id = v_roster.event_id order by opens_at asc limit 1;
  end if;

  if v_chk_id is null then
    return jsonb_build_object('ok', false, 'message', 'No checkpoint configured for this event.');
  end if;

  insert into public.attendance_marks (roster_id, checkpoint_id, method, verified_by)
  values (v_roster.id, v_chk_id, 'volunteer_scan', v_actor)
  on conflict (roster_id, checkpoint_id) do update set verified_by = v_actor, method = 'volunteer_scan';

  return jsonb_build_object('ok', true, 'message', format('Verified %s (%s).', v_roster.name, v_roster.reg_no));
end $$;

revoke all on function public.volunteer_verify_student(bigint, bigint) from public, anon;
grant execute on function public.volunteer_verify_student(bigint, bigint) to authenticated;
