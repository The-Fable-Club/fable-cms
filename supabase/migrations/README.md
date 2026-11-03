# Database migrations

The database will change while the club decides what each event / member / page needs. To keep that safe and easy to roll back:

1. **One change = one numbered file** (`0003_add_event_capacity.sql`). Never edit a file that has been applied.
2. Paste the file into the Supabase **SQL editor** and run it. Then record it in the table below.
3. Prefer **additive** changes (new column, new table). Renames/drops get their own migration, with a comment on what breaks.
4. Not sure a field is final? Put it in the `extra` jsonb column first (migration 0002); promote it to a real column later.
5. The public site only depends on the **snapshot** shape (`releases.snapshot`, versioned by `schema_version`), not on the tables, so table changes don't break the live site until a publish uses them.

| File | What | Applied |
|---|---|---|
| `0001_baseline.sql` | Tables, RLS, policies, storage bucket, seed owner | yes, 2026-10-17 |
| `0002_extra_fields.sql` | `extra jsonb` on aims/events/members, `schema_version` on releases | yes |
| `0003_public_release_invoker.sql` | Replaces the security-definer `public_release` view with a security-invoker view, a narrow RLS policy and column grants; locks the admin helper functions to signed-in users. **Run after 0002.** | yes |
| `0004_flexible_details_and_registrations.sql` | Date/time/venue/seats/apply modes on events; general members; the `registrations` table with RLS, spam brakes and an "event accepts registrations" check; insert-only access for the public role; deploy-status updates on releases | applied 2026-10-17 |
| `0005_trigger_functions_security_definer.sql` | Fix: the spam-limit triggers now run with owner rights, because the public role can no longer read the tables they count (every sign-up was refused until this) | applied 2026-10-17 |
| `0006_roles.sql` | Four access levels (member < creator < admin < owner) enforced by row level security, `role_rank()`, draft events, photo upload rights | applied 2026-10-18 |
| `0007_eventhub_questions.sql` | The official EventHub link on events (host-locked) and event questions (public insert, spam limits, creators draft answers, admins publish/hide/email) | applied 2026-11-02 |
| `0008_recruitment.sql` | Recruitment: phone, preferred team, what they want to build, the short task answer; intakes with one application per registration number; old trial rows set apart as `pre-launch`; review steps incl. `shortlisted` | applied 2026-11-02 |
| `0009_atomic_publish.sql` | `publish_release()`: Publish and roll-back save the release under an advisory lock that re-checks the one-minute limit on the database clock, so two people publishing at once cannot both get through. Runs with the caller's rights (release RLS still applies). The CMS falls back to a plain insert until this is applied | applied 2026-11-03 |
| `0010_application_alert.sql` | Emails the club for each new application: an after-insert trigger posts the row to the CMS hook (pg_net, in the background, never blocks the insert). The shared secret lives in the vault as `application_hook_secret` and in the CMS env as `APPLICATION_HOOK_SECRET`, never in the repo | applied 2026-11-03 |
| `0011_keep_an_owner.sql` | The database refuses any statement that would leave the CMS with no owner, and refuses `truncate admins` (lock-out guard; see docs/RECOVERY.md) | applied 2026-11-03 |
| `0012_owner_haise_and_quiet_tests.sql` | haise-727 must always stay a CMS owner (on top of 0011); test applications (intake `zz-…`) send no alert email | applied 2026-11-03 |
| `0013_hardening.sql` | Defence in depth: the public role keeps only the privileges it uses, no TRUNCATE/TRIGGER/REFERENCES for app roles, fixed search_path everywhere, raster-only uploads, alert emails capped at 10 an hour and 50 a day. Checked by `tests/live/hardening.live.test.ts` | applied 2026-11-03 (staging first) |
