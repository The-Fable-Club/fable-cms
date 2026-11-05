-- 0016: team-specific answers on applications (fable-site#24).
-- Each team asks two questions of its own, plus one question everyone answers; the site sends
-- them as a list of {q, a} so the CMS can show the exact question asked, even after the
-- wording in fable-site content/teams.json changes. The separate "what would you like to
-- build" box is gone from the form (the team questions cover it), so new rows may leave
-- `build` empty; old rows keep theirs. Additive; safe to run more than once.

alter table public.applications add column if not exists answers jsonb;

alter table public.applications drop constraint if exists applications_answers_check;
alter table public.applications add constraint applications_answers_check check (
  answers is null or (
    jsonb_typeof(answers) = 'array'
    and jsonb_array_length(answers) between 1 and 6
    and octet_length(answers::text) <= 24000
  )
);

-- every real application answers everything; `build` OR the team answers (the new form)
alter table public.applications drop constraint if exists applications_complete_check;
alter table public.applications add constraint applications_complete_check
  check (intake = 'pre-launch' or (phone is not null and team is not null and task is not null and (build is not null or answers is not null)));
