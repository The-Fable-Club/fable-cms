# Who can do what

Last checked: 2026-10-17.

## Two separate doors

| Door | What it controls | Where it is managed |
|---|---|---|
| **GitHub repo / org access** | Reading and changing code, Vercel deploys | GitHub (org settings, teams) |
| **CMS access** | Signing in to cms.thefableclub.com, editing, publishing | The `admins` table in Supabase |

Being in the org or on the repo does **not** let anyone into the CMS. Signing in with GitHub only works if that username has a row in `admins`. Anyone else is turned away after login. This is deliberate: a repo collaborator can read and deploy code, but should not be able to publish content unless someone decided so.

## CMS admins (Supabase `admins` table)

| GitHub | Role | Added by |
|---|---|---|
| haise-727 | owner | bootstrap |
| sharann-del | owner | haise-727 (2026-10-17) |

- **owner**: edit, publish, re-publish old releases, manage admins.
- **editor** (the database calls it `editor`): edit and publish. Cannot manage admins.
- The `ADMIN_GITHUB_USERNAMES` value in `.env.local` is only a leftover note. The table decides.
- Usernames are stored lower-case and matched lower-case.
- Nobody can change their own access level (an owner cannot demote themselves); another owner has to do it. The last owner can never be removed or demoted.
- To add or remove someone: the CMS **Admins** screen (owner only, being built), or in the Supabase SQL editor: `insert into admins (github_username, role, added_by) values ('name', 'editor', 'your-name');`

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
