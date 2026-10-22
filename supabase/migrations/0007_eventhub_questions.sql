-- 0007: the official EventHub link and event questions (FAQ).
-- NOT YET APPLIED. Run after 0001-0006. Safe to run more than once.
-- Plans: docs/EVENTHUB.md, docs/EVENT-QA.md.

-- ============================================================ EventHub link
-- Can only ever point at the real EventHub (https, exact host), never a look-alike.
alter table events add column if not exists eventhub_url text;
alter table events drop constraint if exists events_eventhub_url_check;
alter table events add constraint events_eventhub_url_check
  check (eventhub_url is null or (eventhub_url ~ '^https://eventhubcc\.vit\.ac\.in(/|$)' and char_length(eventhub_url) <= 500));

-- ============================================================ event questions
create table if not exists event_questions (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  event_slug   text not null check (char_length(event_slug) between 1 and 80),
  question     text not null check (char_length(btrim(question)) between 5 and 500),
  name         text check (name is null or char_length(btrim(name)) between 1 and 80),
  email        text check (email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200)),
  answer       text check (answer is null or char_length(answer) <= 2000),
  answered_at  timestamptz,
  answered_by  text,
  show_on_site boolean not null default false,
  hidden       boolean not null default false,
  emailed_at   timestamptz
);
create index if not exists event_questions_event on event_questions (event_slug, created_at);
create index if not exists event_questions_created on event_questions (created_at);

-- Can this event take questions? Live (not draft, not archived). Runs as owner so the public role needs no read access.
create or replace function public.event_accepts_questions(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e where e.slug = p_slug and not e.archived and not e.draft)
$$;
revoke all on function public.event_accepts_questions(text) from public;
grant execute on function public.event_accepts_questions(text) to anon, authenticated;

-- Spam brakes: 5 per email per hour (when an email is given), 300 per hour in total.
create or replace function public.limit_questions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and (select count(*) from event_questions where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many questions from this email' using errcode = 'P0001';
  end if;
  if (select count(*) from event_questions where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'questions are temporarily busy' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.limit_questions() from public, anon, authenticated;
drop trigger if exists t_limit_questions on event_questions;
create trigger t_limit_questions before insert on event_questions for each row execute function public.limit_questions();

-- Creators may draft answers; only admins and owners publish, hide, send or change the email.
create or replace function public.guard_question_moderation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.role_rank() < 3 and (
       new.show_on_site is distinct from old.show_on_site
    or new.hidden       is distinct from old.hidden
    or new.emailed_at   is distinct from old.emailed_at
    or new.email        is distinct from old.email
    or new.event_slug   is distinct from old.event_slug) then
    raise exception 'only admins can publish, hide or email answers' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_question_moderation() from public, anon, authenticated;
drop trigger if exists t_guard_question_moderation on event_questions;
create trigger t_guard_question_moderation before update on event_questions for each row execute function public.guard_question_moderation();

alter table event_questions enable row level security;
drop policy if exists public_insert on event_questions;
create policy public_insert on event_questions for insert to anon, authenticated
  with check (
    answer is null and answered_at is null and answered_by is null and emailed_at is null
    and not show_on_site and not hidden
    and public.event_accepts_questions(event_slug)
  );
drop policy if exists staff_read on event_questions;
create policy staff_read   on event_questions for select to authenticated using (role_rank() >= 1);
drop policy if exists staff_update on event_questions;
create policy staff_update on event_questions for update to authenticated using (role_rank() >= 2) with check (role_rank() >= 2);
drop policy if exists admin_delete on event_questions;
create policy admin_delete on event_questions for delete to authenticated using (role_rank() >= 3);

revoke all on event_questions from anon;
grant insert on event_questions to anon;
