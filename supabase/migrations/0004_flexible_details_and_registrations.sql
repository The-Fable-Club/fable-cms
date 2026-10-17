-- 0004: "not decided yet" details, general members, event registrations.
-- NOT YET APPLIED. Run after 0001-0003. Safe to run more than once.
-- (Written while the events and members tables are empty, so the new strict
--  constraints cannot clash with existing rows.)

-- =========================================================== events
alter table events alter column start_date drop not null;   -- month / text / TBA dates have no exact day

alter table events
  add column if not exists date_mode  text not null default 'exact',
  add column if not exists date_month text,
  add column if not exists date_text  text,
  add column if not exists time_mode  text not null default 'text',
  add column if not exists venue_mode text not null default 'text',
  add column if not exists seats_mode text not null default 'text',
  add column if not exists apply_mode text not null default 'none';

alter table events drop constraint if exists events_date_mode_check;
alter table events add  constraint events_date_mode_check  check (date_mode  in ('exact','month','text','tba'));
alter table events drop constraint if exists events_time_mode_check;
alter table events add  constraint events_time_mode_check  check (time_mode  in ('text','tba'));
alter table events drop constraint if exists events_venue_mode_check;
alter table events add  constraint events_venue_mode_check check (venue_mode in ('text','online','tba'));
alter table events drop constraint if exists events_seats_mode_check;
alter table events add  constraint events_seats_mode_check check (seats_mode in ('text','open','tba'));
alter table events drop constraint if exists events_apply_mode_check;
alter table events add  constraint events_apply_mode_check check (apply_mode in ('form','link','soon','closed','none'));

alter table events drop constraint if exists events_month_format;
alter table events add  constraint events_month_format check (date_month is null or date_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- each mode must carry the value it needs
alter table events drop constraint if exists events_date_complete;
alter table events add  constraint events_date_complete check (
     (date_mode = 'exact' and start_date is not null and (end_date is null or end_date >= start_date))
  or (date_mode = 'month' and date_month is not null)
  or (date_mode = 'text'  and char_length(btrim(coalesce(date_text, ''))) > 0)
  or  date_mode = 'tba'
);
alter table events drop constraint if exists events_details_complete;
alter table events add  constraint events_details_complete check (
      (time_mode  <> 'text' or char_length(btrim(time_text)) > 0)
  and (venue_mode <> 'text' or char_length(btrim(venue)) > 0)
  and (seats_mode <> 'text' or char_length(btrim(coalesce(seats, ''))) > 0)
  and (apply_mode <> 'link' or char_length(btrim(coalesce(apply_url, ''))) > 0)
);

-- =========================================================== members
-- The board and faculty stay hardcoded in the site repo; 'Member' is for the general members page.
alter table members drop constraint if exists members_group_check;
alter table members add  constraint members_group_check check ("group" in ('Faculty','Board','Leads','Member'));

alter table members
  add column if not exists year_mode  text    not null default 'text',
  add column if not exists show_email boolean not null default false;
alter table members drop constraint if exists members_year_mode_check;
alter table members add  constraint members_year_mode_check check (year_mode in ('pick','text','none'));

-- =========================================================== registrations (live: written by the public site)
create table if not exists registrations (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  event_slug  text not null check (char_length(event_slug) between 1 and 80),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  reg_no      text not null check (char_length(btrim(reg_no)) between 5 and 20),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  department  text not null check (char_length(btrim(department)) between 2 and 120),
  year        text not null check (char_length(year) <= 30),
  phone       text check (phone is null or char_length(phone) between 7 and 20),
  answers     jsonb not null default '{}'::jsonb check (pg_column_size(answers) < 4000),
  status      text not null default 'new' check (status in ('new','confirmed','waitlist','cancelled')),
  notes       text
);
create unique index if not exists registrations_one_per_event on registrations (event_slug, lower(email));
create index if not exists registrations_created_at on registrations (created_at);
create index if not exists applications_created_at on applications (created_at);

-- Can this event take registrations right now? Runs as the owner so the public
-- role does not need to read the events table. Past events and drafts say no.
create or replace function public.event_accepts_registrations(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.slug = p_slug
      and e.apply_mode = 'form'
      and not e.archived
      and e.status_override is distinct from 'past'
      and (e.date_mode <> 'exact' or coalesce(e.end_date, e.start_date) >= (now() at time zone 'Asia/Kolkata')::date)
      and (e.date_mode <> 'month'
           or (to_date(e.date_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date >= (now() at time zone 'Asia/Kolkata')::date)
  )
$$;
revoke all on function public.event_accepts_registrations(text) from public;
grant execute on function public.event_accepts_registrations(text) to anon, authenticated;

-- Abuse brakes: 3 per person per hour, and a flood guard over everyone.
create or replace function public.limit_registrations() returns trigger
language plpgsql as $$
begin
  if (select count(*) from registrations where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too many registrations for this email' using errcode = 'P0001';
  end if;
  if (select count(*) from registrations where created_at > now() - interval '1 hour') >= 500 then
    raise exception 'registrations are temporarily busy' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists t_limit_registrations on registrations;
create trigger t_limit_registrations before insert on registrations for each row execute function public.limit_registrations();

-- The same flood guard for applications (the per-email limit already exists).
create or replace function public.limit_applications() returns trigger
language plpgsql as $$
begin
  if (select count(*) from applications where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too many applications for this email' using errcode = 'P0001';
  end if;
  if (select count(*) from applications where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'applications are temporarily busy' using errcode = 'P0001';
  end if;
  return new;
end $$;

alter table registrations enable row level security;
drop policy if exists public_insert on registrations;
create policy public_insert on registrations for insert to anon, authenticated
  with check (status = 'new' and public.event_accepts_registrations(event_slug));
drop policy if exists admin_read on registrations;
create policy admin_read on registrations for select to authenticated using (is_admin());
drop policy if exists admin_update on registrations;
create policy admin_update on registrations for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists admin_delete on registrations;
create policy admin_delete on registrations for delete to authenticated using (is_admin());

-- Least privilege for the public role: it may insert and nothing else.
revoke all on registrations from anon;
grant insert on registrations to anon;
revoke all on applications from anon;
grant insert on applications to anon;

-- =========================================================== releases
-- Lets the CMS record the deploy result on the release it just created.
drop policy if exists admin_update on releases;
create policy admin_update on releases for update to authenticated using (is_admin()) with check (is_admin());
