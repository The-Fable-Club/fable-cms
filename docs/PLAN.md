# Fable Club CMS: plan v2

Private repo. Nothing here is built yet except the env template and the SQL draft (`supabase/schema.sql`, not yet run).
Decisions from the club are folded in below; open items are in section 11.

## 1. Goals (as decided)
- A separate, private admin app (this repo), not part of the public site repo.
- Content lives in Supabase. Editors never touch the public repo.
- **Publish** = save one snapshot, trigger the public site's Vercel deploy hook **once**; the site rebuilds statically from that snapshot. Visitors never read the content tables.
- Publish is manual (plus automatic on the button), no nightly rebuild.
- Join-form applications are **live**: the public site writes them straight into Supabase, and this CMS reads them.
- Admins sign in with **GitHub**: the owner (Haise-727) first, then whichever GitHub accounts are collaborators on `The-Fable-Club/fable-site`.

## 2. Architecture

```
 Public site (public repo, Vercel project A)            CMS (this private repo, Vercel project B)
 ┌────────────────────────────────┐                      ┌───────────────────────────────┐
 │ static pages from content/*.json│◀── build reads ──┐   │ /login  (GitHub via Supabase)  │
 │ join form ── INSERT only ──┐    │   latest release │   │ edit events / members / club   │
 └────────────────────────────┼────┘                  │   │ media library, releases        │
                              │                       │   │ applications inbox             │
                              ▼                       │   │ [Publish] ─────────────────────┼──┐
                    ┌──────────────────────────────────┴─┐ └──────────────┬────────────────┘  │
                    │ Supabase: tables + RLS + Storage   │◀── read/write ─┘                   │
                    └────────────────────────────────────┘                                     │
                                  Vercel deploy hook (project A) ◀─────────────────────────────┘
```

- Two Vercel projects, two repos, two sets of secrets. The public repo contains **no** admin code.
- Public site reads exactly one thing at build time: the latest row of `releases` (through a view, anon key, read-only).
- Media: Supabase Storage public bucket; the snapshot stores image URLs and sizes.

## 3. Why a separate private repo (my recommendation, confirmed)
- No admin routes, no admin code or schema hints in the public repo.
- Independent deploy, domain and protection rules (e.g. Vercel Deployment Protection, own domain like `cms.<club domain>`).
- The service-role key and deploy hook exist only in this project's environment.
- A bug or dependency issue in the CMS can't affect the public site's build.

## 4. Login and authorisation
1. Supabase Auth, **GitHub provider only**. Email/password and sign-ups are disabled.
2. After login the server checks the GitHub username against the `admins` table (seeded with `haise-727`, role `owner`).
3. Optional second gate (recommended): the server also asks GitHub whether that user is a **collaborator with write access** on `The-Fable-Club/fable-site` (`GET /repos/{owner}/{repo}/collaborators/{user}/permission`, using a read-only fine-grained token kept server-side). Then adding someone as a collaborator on the org repo is what grants CMS access, as you described; `admins` stays as the owner list and an emergency override. *Untested: needs the org repo and a token to confirm the exact token permission required.*
4. The DB enforces the same rule independently: RLS policies call `is_admin()`, which reads the GitHub username from `auth.identities` (server-controlled), never from `user_metadata` (which a user can edit).
5. Org-level: require 2FA for the GitHub org.

## 5. Security checklist
- RLS on every table; the anon role has **no** access to content tables, `admins`, `releases`, or `audit_log`.
- Anon can only: read the public release view, and INSERT into `applications` (with length checks, a rate-limit trigger, honeypot field, optional Turnstile).
- Service-role key: server-only env var, only in this project; never in client bundles.
- Publish: owner/editor role check, server-side validation, rate limit (1 per minute), audit-log entry, deploy hook URL never sent to the browser.
- Media uploads: signed upload URLs, image types only, ≤ 5 MB, resized client-side to ≤ 1600 px WebP.
- Strict security headers (CSP, frame-ancestors none, no-sniff), secure/HttpOnly/SameSite cookies, short session lifetime, CSRF-safe server actions.
- Audit log of every write (who, what, when) and release history = full rollback.
- Secrets are never pasted in chat or committed (`.env*` is git-ignored; see `.env.example`).
- Backups: Supabase backups; the `releases` table is itself a complete history.

## 6. Publish flow
1. Edits save as drafts instantly; the public site is unaffected.
2. Dashboard shows "N unpublished changes".
3. **Publish**: validate, build the snapshot JSON, insert a `releases` row, POST the deploy hook.
4. Public build: `prebuild` script fetches the latest release (one request) and writes `content/*.json`; the existing site code renders from those files.
5. Failure: if Supabase is unreachable, the build fails (the old site stays live); no silent empty deploys.
6. Rollback: re-publish any earlier release.
7. Live/Open/Past stays date-derived on the site (cached up to an hour), so it needs no rebuild.

## 7. Applications (live)
- The public join form inserts into `applications` with the anon key; RLS allows INSERT only.
- This CMS has an inbox: list, filter, mark reviewed/accepted/rejected, export CSV.
- Spam controls: honeypot, per-email and per-IP rate limit, optional Cloudflare Turnstile.

## 8. Supabase free tier note (important)
A free project **pauses after about a week of no activity**. While paused it **rejects all requests**, including the public join-form inserts and the build's release fetch; data is kept, but nothing can be written until someone restores it in the dashboard. A paused project does not queue writes.
Options: a tiny scheduled keep-alive ping (e.g. a free cron hitting a lightweight endpoint every few days), or the Pro plan. I recommend the keep-alive on free for now, and the applications form should show a friendly error if the insert fails.

## 9. Admin screens (all server-gated)
Dashboard · Events (+ hub posts) · Members (by category, reorder, photo) · Club details & aims · Media library · Applications inbox · Releases (history, rollback) · Admins (owner only).

## 10. Build phases
| Phase | Delivers | Needs |
|---|---|---|
| 0 | Apply `supabase/migrations/0001_baseline.sql` (done), GitHub provider on, seed owner (done) | Supabase project, GitHub OAuth app |
| 1 | Next app skeleton here, login, role checks, health page | `.env.local` filled |
| 2 | Publish pipeline: snapshot, deploy hook; public `prebuild` pull script | Deploy hook URL |
| 3 | Editing screens: events, members, club, aims, media | |
| 4 | Applications inbox + public join-form insert | |
| 5 | Releases/rollback, audit view, collaborator check, hardening pass | GitHub token for collaborator check |

## 11. Still open
1. Hub posts (board → event participants): published content (appears after Publish) or live? Currently modelled as content inside each event.
2. Domain for the CMS (custom or `*.vercel.app`)?
3. Turnstile/captcha on the join form: yes/no?
4. Keep-alive vs Pro (see section 8).

## 12. Domain
The club domain is **thefableclub.com**. Suggested: public site on the apex / www, CMS on a subdomain such as cms.thefableclub.com (own Vercel project, own deployment protection).

## 13. Setting up credentials (no secrets in chat)
Fill `D:\Coding\fable-cms\.env.local` (NAME=value per line). Names are listed in `.env.example`. Only the Supabase **URL** and **anon key** are non-secret. The service-role key, deploy-hook URL and any GitHub token must stay in that file (and later in Vercel's environment settings).
