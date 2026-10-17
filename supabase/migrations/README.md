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

| `0006_roles.sql` | Four access levels (member < creator < admin < owner) enforced by row level security, `role_rank()`, draft events, photo upload rights | **not yet** |
