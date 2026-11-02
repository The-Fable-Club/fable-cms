-- 0008: recruitment applications, as the club decided (2026-11).
-- NOT YET APPLIED. Run after 0001-0006 (it does not need 0007). Safe to run more than once.
--
-- What changes:
--   * new answers, required for every new application: phone/WhatsApp, preferred team,
--     what they want to build or learn, and the answer to the short task
--   * applications belong to an intake (e.g. '2026-27'); one per registration number per intake
--   * the old "experience level" and "tracks" questions are no longer asked (columns kept for old rows)
--   * a review step between "reviewed" and a decision: "shortlisted" (invited to the short chat)
--   * rows that existed before this file (trials and tests) move to the 'pre-launch' intake,
--     which visitors cannot write to

alter table applications add column if not exists phone  text;
alter table applications add column if not exists team   text;
alter table applications add column if not exists build  text;
alter table applications add column if not exists task   text;
alter table applications add column if not exists intake text;

update applications set intake = 'pre-launch' where intake is null;
alter table applications alter column intake set default '2026-27';
alter table applications alter column intake set not null;
alter table applications alter column level drop not null;

alter table applications drop constraint if exists applications_phone_check;
alter table applications add constraint applications_phone_check check (phone is null or phone ~ '^[0-9+()\- ]{7,20}$');
alter table applications drop constraint if exists applications_team_check;
alter table applications add constraint applications_team_check check (team is null or char_length(btrim(team)) between 2 and 60);
alter table applications drop constraint if exists applications_build_check;
alter table applications add constraint applications_build_check check (build is null or char_length(btrim(build)) between 10 and 2000);
alter table applications drop constraint if exists applications_task_check;
alter table applications add constraint applications_task_check check (task is null or char_length(btrim(task)) between 20 and 3000);
alter table applications drop constraint if exists applications_intake_check;
alter table applications add constraint applications_intake_check check (intake ~ '^[A-Za-z0-9-]{1,40}$');
-- Every real application answers everything.
alter table applications drop constraint if exists applications_complete_check;
alter table applications add constraint applications_complete_check
  check (intake = 'pre-launch' or (phone is not null and team is not null and build is not null and task is not null));

-- The review steps (src/lib/applications.ts): "shortlisted" = invited to the short chat.
alter table applications drop constraint if exists applications_status_check;
alter table applications add constraint applications_status_check check (status in ('new','reviewed','shortlisted','accepted','rejected'));

-- One application per person per intake (the site turns the clash into "you have already applied").
-- (old trial rows may repeat a number, so they are left out of the rule)
create unique index if not exists applications_one_per_intake on applications (intake, upper(reg_no)) where intake <> 'pre-launch';
create index if not exists applications_intake on applications (intake, created_at);

-- Visitors may only file a fresh, untouched application into a real intake.
drop policy if exists public_insert on applications;
create policy public_insert on applications for insert to anon, authenticated
  with check (status = 'new' and notes is null and intake <> 'pre-launch');
