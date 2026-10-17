# Who can do what

Last checked: 2026-10-17.

## Two separate doors

| Door | What it controls | Where it is managed |
|---|---|---|
| **GitHub repo / org access** | Reading and changing code, Vercel deploys | GitHub (org settings, teams) |
| **CMS access** | Signing in to cms.thefableclub.com, editing, publishing | The `admins` table in Supabase |

Being in the org or on the repo does **not** let anyone into the CMS. Signing in with GitHub only works if that username has a row in `admins`. Anyone else is turned away after login. This is deliberate: a repo collaborator can read and deploy code, but should not be able to publish content unless someone decided so.

## CMS access levels (Supabase `admins` table)

Four levels. Each includes everything below it. Enforced by the database (migration 0006) and mirrored in the app (`src/lib/roles.ts`).

| Level | Can |
|---|---|
| **Member** | Read applications and registrations, download CSV. Nothing else. |
| **Creator** | + create events and edit events that are still **drafts**; upload photos. Cannot touch live events or members, cannot publish. |
| **Admin** | + edit everything (live events, members, sign-up status and notes), take drafts live, publish, see release history. Cannot manage people. |
| **Owner** | + add, remove and re-level people, retry a rebuild, roll back to an old release. |

Rules: nobody can change their own level (an owner cannot demote themselves); the last owner can never be removed or demoted; only owners see the People screen.

| GitHub | Level | Added by |
|---|---|---|
| haise-727 | owner | bootstrap |
| sharann-del | owner | haise-727 (2026-10-17) |

- The `ADMIN_GITHUB_USERNAMES` value in `.env.local` is only a leftover note. The table decides.
- Usernames are stored lower-case and matched lower-case.
- To add or remove someone: the CMS **People** screen (owners), or in the Supabase SQL editor: `insert into admins (github_username, role, added_by) values ('name', 'creator', 'your-name');`
- Until migration 0006 is applied the database only knows `owner` and `editor`; the app treats a former editor as an admin.
- Rolling out levels sensibly: most people **Creator** or **Member**, a few **Admin** (the ones who publish), two **Owner**.

## GitHub (as of 2026-10-17)

All six org members are org **owners**, so each has admin on every repo: Haise-727, Sharann-del, ragavhariharan, rakshithshakkthi, babi-13, Samyuktha-21.
Team `webdev` currently has only Haise-727 (maintain on fable-site and fable-cms).
Sharann plans to review who should stay an org owner.

## Planned team layout (not created yet)

- **WebDev-Leads**: the people who actually get write/maintain access to the site and CMS repos.
- **WebDev**: normal web team members, read access plus a few extras.
- When these exist: repo access follows the teams, and CMS access is still granted person by person in `admins`.
- The existing `webdev` team only holds higher-ups; rename or replace it when the two teams are made.

## Optional hardening (try, not required)

On CMS sign-in, also check that the person is still a member of the GitHub org (so leaving the org removes CMS access even if the `admins` row remains). Needs a GitHub token with `read:org` stored server-side only. Not built yet; do it after the main pipeline works.
