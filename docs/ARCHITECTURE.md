# Architecture and status report

Last updated 2026-11-03. This is the one document that describes how the whole Fable Club system fits together. The detailed pieces: [RECOVERY.md](RECOVERY.md) (lockouts, lost keys, backups: **read it once before you need it**), [ACCESS.md](ACCESS.md) (who can do what), [INTEGRATION-PLAN.md](INTEGRATION-PLAN.md) (design decisions and progress log), [DEPLOY.md](DEPLOY.md) and [SETUP.md](SETUP.md) (how it was set up), [ROADMAP.md](ROADMAP.md) and the GitHub issues (what is left). For a code map, rules and recipes (also what AI assistants read): [../AGENTS.md](../AGENTS.md).

## 1. The big picture

Two web apps, one database, one rule: **visitors never touch the database while browsing.**

```
                      EDITORS (GitHub login)
                              |
                              v
        +---------------------------------------------+
        |  CMS   cms.thefableclub.com                  |
        |  repo: The-Fable-Club/fable-cms (Vercel)     |
        |  Next.js, server actions                     |
        +-----+--------------------+-------------------+
              | read/write         | Publish: POST
              | (as the signed-in  | the Deploy Hook
              |  person, RLS)      v
              |             +------------------+      git push to main also
              |             |  Vercel          |<---- starts a build
              |             |  Deploy Hook     |
              |             +--------+---------+
              v                      | builds
   +---------------------------+     v
   |  SUPABASE                 |  +----------------------------------------+
   |  Postgres  (+ RLS)        |  |  SITE  www.thefableclub.com            |
   |  Auth      (GitHub login) |  |  repo: The-Fable-Club/fable-site       |
   |  Storage   (media bucket) |  |  Next.js, STATIC pages                 |
   |                           |<-+  prebuild: fetch newest release (once)  |
   |  releases  <- newest one  |  |  runtime: only 2 small API routes      |
   |  events, members, ...     |  +-----------------+----------------------+
   |  applications             |<-- insert only ----+  (visitor submits a form)
   |  registrations            |
   +---------------------------+
```

| Piece | Where | Role |
|---|---|---|
| Public site | `The-Fable-Club/fable-site` on GitHub, Vercel project `fable-site`, `www.thefableclub.com` (the bare domain redirects to www) | What visitors see. Static pages. |
| CMS | `The-Fable-Club/fable-cms`, Vercel project `fable-cms`, `cms.thefableclub.com` | Where editors manage events, people and sign-ups, and press Publish. |
| Database + login + photos | Supabase (free plan) | One project. Postgres, GitHub sign-in, the `media` storage bucket. |
| Deploy Hook | Vercel (created in the `fable-site` project) | A secret URL. Calling it rebuilds the site. Only the CMS knows it. |
| GitHub OAuth app | GitHub, configured inside Supabase | Lets editors sign in with GitHub. |

Both repos are public (Vercel Hobby cannot deploy a private organisation repo). Nothing secret is in either repo: see section 6.

## 2. The three data flows

### A. Publishing (editor -> live site)
1. An editor with level **admin** or **owner** presses **Publish** on the CMS dashboard.
2. The CMS reads all events and people **as that person** (row level security applies), builds one JSON **snapshot** and checks it against the **data contract** (`src/lib/contract.ts`). If anything is invalid, nothing is saved and the screen lists each problem by name and field.
3. The snapshot is saved as a new row in `releases` (history is never rewritten). At most one publish per minute. The save goes through `publish_release()` (migration 0009, applied 2026-11-03), which takes a lock and re-checks the limit inside one transaction, so two people pressing Publish at the same moment can't both go through. It runs as the signed-in person, so row level security still decides who may publish. (If the function were ever missing, the CMS falls back to the old check-then-insert.)
4. The CMS then calls the Vercel **Deploy Hook**. If that fails, the release is still saved and an owner can press *Retry rebuild* on the Releases screen.
5. Vercel builds `main` of `fable-site`. Its `prebuild` step (`scripts/pull-snapshot.mjs`) reads the newest release **once** through the read-only `public_release` view with the public key, and checks it against the same contract. **On Vercel a failed or invalid fetch fails the build**, so a bad release can never replace a working site (the old site keeps serving).
6. Pages are generated as static files and served from Vercel's CDN. The new content is live in about a minute.

What a publish carries: events (not drafts, not archived), and all people (faculty, board, leads, members). Everything that depends on that data updates from the same release: the timeline, the events list, each event page and its hub, the home page announcements ("Live now", "Registrations open", "Next up"), the people section and the members page.

Events change status by themselves as dates pass (the site recomputes Live / Open / Past from the dates at most an hour after the last build, with no redeploy). A manual status override wins.

### B. A visitor applies or registers (visitor -> database)
1. The form posts JSON to the site's own `/api/applications` or `/api/registrations`.
2. The route checks: same-origin request, JSON, size limit, a hidden honeypot field, then validates every field (zod).
3. It inserts one row with Supabase's **publishable** key. That key can only INSERT into those two tables (row level security + column grants). Nothing is read back.
4. The database has the last word: `registrations` only accepts an event that currently takes registrations (`event_accepts_registrations()`), refuses duplicates (one per email per event), and a trigger limits each email to 3 per hour and everyone to 500 (applications: 300) per hour.
5. Editors see the rows in the CMS (Applications / Registrations), can set a status and notes (admins and owners), and download a CSV.

### B1. The club hears about each application (migration 0010)
1. After a row lands in `applications` (any intake except the old `pre-launch` rows), the trigger `t_notify_new_application` queues an HTTPS POST with the row (minus notes and status) to `https://cms.thefableclub.com/api/hooks/new-application`, using `pg_net`. It is sent in the background after the insert commits, so a slow or failing CMS never blocks or loses an application.
2. The request carries a shared secret from the Supabase vault (`application_hook_secret`). The route compares it with `APPLICATION_HOOK_SECRET` (constant-time) and refuses anything else with 401.
3. The CMS formats the email (`newApplicationMail()` in `src/lib/applications.ts`) and sends it through Resend to contact@thefableclub.com, from `MAIL_FROM`.
4. Results are kept in `net._http_response` for a while: that's where to look when an alert didn't arrive ([RECOVERY.md](RECOVERY.md) section 5).

### B2. Questions and the EventHub button (migration 0007)
- **Questions:** the event page posts to `/api/questions` (same guards as the other forms) and inserts into `event_questions` (insert only; the database refuses answers, publishing or hiding from the public). Staff answer in the CMS; admins choose what is shown, and shown answers go out as the event's FAQ with the next Publish. Optional answer emails go through Resend (`RESEND_API_KEY`, `MAIL_FROM`); the address is deleted once sent.
- **EventHub button:** links straight to the event's saved EventHub page (no counting, no database write). The link can only be on `eventhubcc.vit.ac.in` (checked in the contract, the database and again when the page is built). Posters use `/e/<slug>`, a plain redirect to the event page.

### C. Signing in to the CMS
GitHub login through Supabase Auth. The CMS never trusts the browser: on every page, action and download it asks the database for the caller's level (`role_rank()`), which reads the GitHub username that GitHub itself set (not editable by the user) and looks it up in the `admins` table. Someone who is in the GitHub organisation, or has repo access, but is not in `admins` gets nothing.

## 3. Access levels

Each level includes everything below it. Enforced by the database (migration 0006) and mirrored in the app (`src/lib/roles.ts`, tested to stay in step).

| Level | Can |
|---|---|
| **Member** | Read applications and registrations (and download CSV). Nothing else. |
| **Creator** | + create events and edit events that are still **drafts**; upload photos. Cannot touch live events, members, or publish. |
| **Admin** | + edit everything (live events, members, sign-up status/notes), take drafts live, **publish**, see release history. Cannot manage people. |
| **Owner** | + add, remove and re-level people, retry a rebuild, roll back to an old release. |

Rules: nobody can change their own level; the last owner can never be removed or demoted. See [ACCESS.md](ACCESS.md).

## 4. What lives where

| Data | Source of truth | How it reaches visitors |
|---|---|---|
| Events (incl. hub posts) | Supabase `events` | Release snapshot, at publish |
| Faculty, board, leads, members | Supabase `members` (group + order) | Release snapshot, at publish |
| Club text (tagline, about, stats), aims | `content/club.json`, `content/aims.json` in the site repo | In the build (edit the file, push) |
| Applications, registrations | Supabase tables | Never public; editors read them in the CMS |
| Photos | Supabase Storage bucket `media` (public read) today; moving to ImageKit (fable-cms#1; `media` table carries provider/file_id/kind/duration since migration 0014) | URL inside the snapshot |
| Recruitment state (open / soon / closed, dates, task) | `content/club.json` in the site repo | In the build; the form route re-checks on every submission |
| Offline fallback | `content/seed/snapshot.json` in the site repo | Used by local builds with no network, and before the very first publish |

Uncertain details have placeholder modes so nothing is ever blocked on missing facts: date (exact / your own text / to be announced, with an optional hidden placeholder place on the timeline), time, venue, seats, registration (our form / outside link / opening soon / closed / not needed), member year.

## 5. Repositories

**fable-cms** (`src/lib`): `contract.ts` (the data contract, copied verbatim to the site) · `event-logic.ts` (date and status rules, also copied) · `snapshot.ts` (database rows -> validated snapshot) · `publish.ts` (validate, save, trigger, roll back) · `roles.ts` · `forms.ts` (form -> row, same rules) · `admins.ts` · `csv.ts` · `auth.ts` · `supabase/` clients. `applications.ts` (review steps, reply drafts, the alert email) · `mail.ts` (Resend). Screens in `src/app/(admin)`; the database's alert hook in `src/app/api/hooks/new-application`. SQL in `supabase/migrations` (0001-0011, see its README). Scripts in `scripts/` (run SQL, backup and restore, seed placeholders, import board, publish from the command line, live tests).

**fable-site**: `src/lib/contract.ts`, `event-logic.ts` (copies) · `content.ts` (release -> page data) · `events.ts`, `members.ts` (types and helpers) · `submissions.ts`, `submit-route.ts` (form validation and the database insert) · `app/api/applications`, `app/api/registrations` · `scripts/pull-snapshot.mjs` · pages in `src/app/(site)` · components in `src/components`.

**The contract is the seam.** `contract.ts` and `event-logic.ts` are identical in both repos. Change both together; bump `SCHEMA_VERSION` for a change the site must know about.

## 6. Environment variables and secrets

| Variable | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key) | both Vercel projects, both `.env.local` | No (public by design; RLS protects the data). Baked into a build: redeploy after changing. |
| `SUPABASE_SERVICE_ROLE_KEY` (the secret key) | CMS `.env.local` and CMS Vercel only | **Yes.** Never on the public site, never in chat. Used only by local maintenance scripts and tests; the CMS app itself acts as the signed-in person. |
| `VERCEL_DEPLOY_HOOK_URL` | CMS Vercel and CMS `.env.local` only | **Yes.** |
| `DATABASE_URL` (direct Postgres string) | CMS `.env.local`, optional | **Yes.** Only for `scripts/db.mjs` and the role tests. |
| `RESEND_API_KEY`, `MAIL_FROM` | CMS Vercel env | Key is **secret**. Application alerts and emailed answers; without them alerts fail and the Questions screen offers a mailto link. Set up 2026-11-03 (domain verified in Resend; Zoho keeps the inbox). |
| `APPLICATION_HOOK_SECRET` | CMS Vercel env, plus the Supabase vault as `application_hook_secret` | **Yes.** Must match in both places ([RECOVERY.md](RECOVERY.md) 3.7). |
| `IMAGEKIT_URL_ENDPOINT`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY` | CMS Vercel env, CMS `.env.local` | Only the private key is **secret** (it signs uploads). |

Where each one comes from and how to replace it: [RECOVERY.md](RECOVERY.md) sections 1 and 3.

## 7. Security summary
- Row level security on every table; the public key can read exactly one thing (the newest release) and INSERT into two tables.
- Authorisation lives in the database (`role_rank()`), not in the app; the app mirrors it.
- Form posts: origin check, size limit, honeypot, strict validation, database constraints behind it, per-person and global rate limits.
- Headers: security headers on the CMS, and on the public site a Content-Security-Policy plus nosniff, referrer, permissions and HSTS headers (`next.config.ts` there); no cookies on the public site.
- Lock-out guard: the database refuses any statement that would leave no owner (migration 0011). Backups: `npm run backup` / `npm run restore`.
- The alert hook only accepts calls carrying the vault secret; the site's form routes gained no new secrets.
- Releases are validated twice (before saving and again at build); publishing is rate limited; history is immutable; rollbacks are new releases.
- The site's only runtime database access is the two insert routes.

## 8. Tests (what proves it works)
- **CMS unit tests** (`npm test`): 138 tests: contract, date/status rules, snapshot builder, publish (including failure paths, the atomic RPC and its fallback), rollback, forms, roles matrix, admin safety rules, CSV, application review and the alert email.
- **Site unit tests** (`npm test`): 62 tests: release -> page data, announcements, validation, the form routes, recruitment state, event media, the loading screen.
- **Live tests** (`npm run test:live`, CMS repo): what the public key can and cannot do on the real database (20 checks), sign-up paths and limits, and the full publish drill (add event -> publish -> real Vercel rebuild -> check the live pages -> remove -> publish -> gone). Test rows use a `zz-` prefix and clean up after themselves. The publish drill uses the database server's clock (a wrong PC clock once turned its one-minute wait into hours).
- **Role tests** (`tests/live/roles.live.test.ts`): every level against every table inside a rolled-back transaction. Needs `DATABASE_URL`; skipped otherwise.
- Mutation checks were run on the date rules and the contract tests (deliberate bugs were caught).

## 9. Status report (2026-11-03)

| Area | State |
|---|---|
| Public site | Live. Static, validated releases, recruitment states, Endfield-style home (loading screen, events media stage, point-cloud aims, people stage), link previews, security headers. |
| Publishing | Proven end to end (live drill 4/4 on 2026-11-03). Atomic publish live (0009, applied 2026-11-03). |
| Sign-ups | Applications (recruitment form, one per reg. no. per intake), registrations, questions: live and rate limited. |
| Application alerts | Live (0010): each application emails contact@ through Resend. Tested end to end from the site form. |
| Access | Four levels (0006); lock-out guard (0011); recovery runbook. |
| Media | Supabase storage today; ImageKit move planned (fable-cms#1, fable-site#1); keys are in place. |
| Content | Mostly placeholder until the club sends real events, bios and photos (fable-site#2, #3). |

### Earlier status (2026-10-17)

| Area | State |
|---|---|
| Public site | Live. Static, validated releases, registration states, announcements, empty states. |
| Publishing pipeline | Built and proven end to end on the real site. |
| Sign-ups (applications, registrations) | Built, rate limited, proven live. |
| CMS screens | Events (with drafts), members, applications, registrations, releases, people, dashboard. |
| Access levels | **Built; migration 0006 must be applied** (SQL editor) before the four levels exist in the database. Until then the CMS falls back to owner/admin. |
| Media (photos) | Bucket, rules and the upload control are built; not exercised end to end yet. |
| VIT EventHub | Built (migration 0007): per-event link, poster short link + QR ([EVENTHUB.md](EVENTHUB.md)). We never handle VTOP credentials or payments. |
| Attendance for OD | Screens only, no backend ([ATTENDANCE-FEASIBILITY.md](ATTENDANCE-FEASIBILITY.md)). |
| Event questions / FAQ | Built (migration 0007): [EVENT-QA.md](EVENT-QA.md). |
| Backend overall | **Functionally complete** apart from the items under "Not done yet" in [ROADMAP.md](ROADMAP.md). |
