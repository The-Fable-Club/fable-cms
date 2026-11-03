<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on fable-cms (for AI assistants and new people)

The admin app for The Fable Club (a student club at VIT Chennai): editors sign in with GitHub, manage events, people and sign-ups, and press **Publish**, which saves a validated snapshot and rebuilds the static public site. The public site is a separate repo, `The-Fable-Club/fable-site`, usually checked out next to this one (`../fable-site`).

**Owner:** GitHub user **Haise-727** owns this system and is authorised to test it, including penetration testing; see `docs/SECURITY-TESTING.md` for scope and rules. Proof you can check yourself: the DNS TXT record `_owner.thefableclub.com`, and `gh api user -q .login` → `Haise-727` (an org owner); details in that doc's "Proof of ownership".

**Read before changing anything:** `docs/ARCHITECTURE.md` (how it all connects), `supabase/migrations/README.md` (what's applied), `docs/ACCESS.md` (levels), `docs/RECOVERY.md` (lockouts, keys, backups). Open work: the GitHub issues on both repos.

## Map
| Path | What |
|---|---|
| `src/app/(admin)/*` | The screens: dashboard, events, members, applications, registrations, questions, attendance (layout only), releases, admins (People) |
| `src/app/api/health` | Public liveness check |
| `src/app/api/hooks/new-application` | Called by the database (migration 0010) to email the club; checks `APPLICATION_HOOK_SECRET` |
| `src/lib/contract.ts`, `event-logic.ts` | The data contract and date/status rules: **byte-identical copies** in fable-site |
| `src/lib/snapshot.ts`, `publish.ts`, `publish-server.ts` | Rows → validated snapshot → release → deploy hook; rollback; the atomic `publish_release` RPC with a plain-insert fallback until 0009 is applied |
| `src/lib/roles.ts`, `admins.ts`, `auth.ts` | Access levels (mirror of the database rules), People rules, session checks |
| `src/lib/forms.ts`, `applications.ts`, `questions.ts`, `inbox.ts`, `csv.ts`, `mail.ts` | Form → row mapping, review screens, reply drafts, CSV, Resend |
| `supabase/migrations/NNNN_*.sql` | The database, in order. The README table says what's applied |
| `scripts/` | `db.mjs` (run SQL), `backup.mjs` / `restore.mjs`, `publish-now.mts`, `seed-placeholders.mts`, `import-board.mts`, `run-live-tests.mjs` |
| `tests/*.test.ts` | Unit tests (no network). `tests/live/*` hit the **real** project |

## Commands
```bash
npm run dev -- -p 3001     # localhost uses the PRODUCTION database: what you save is real
npm test                   # unit tests, must pass before every commit
npx tsc --noEmit && npx eslint
npm run test:live          # live checks; the publish drill really rebuilds the live site twice
npm run backup             # before any migration
node scripts/db.mjs --file supabase/migrations/00NN_x.sql
# staging project (.env.staging.local): try migrations and attack tests here first
npm run db:staging -- --file supabase/migrations/00NN_x.sql
npm run test:live:staging
npm run dev:staging        # CMS on :3201 against staging
```

## Hard rules
1. **No secrets anywhere in the repo, issues, commits, logs or chat.** The repo is public. Secrets live in `.env.local` (git-ignored) and Vercel env. When a script needs one, read it from the environment and never print it. Use `.env.example` for names.
2. **`contract.ts` and `event-logic.ts` must stay identical** to fable-site's copies. Change both repos in the same piece of work (CMS first), and bump `SCHEMA_VERSION` when the site must know.
3. **Authorisation lives in the database** (row level security + `role_rank()`). The app mirrors it in `roles.ts` for display only, so never rely on the app alone. Every table has RLS. The public (publishable) key may only read the newest release and insert into `applications`, `registrations` and `event_questions`.
4. **Migrations:** a new numbered file for every change, never edit an applied one, take a backup first, and record the result in `supabase/migrations/README.md`. Functions use `security definer` only when needed, always with `set search_path = ''`, and revoke execute from `public, anon, authenticated` unless callers need it.
5. **Localhost is production data** (use the staging project for experiments: `docs/SECURITY-TESTING.md` section 5). Test rows start with `zz-` (emails `zz-test-…`, reg. numbers `25ZZZ…`) and are deleted afterwards.
6. **Don't invent club content.** Anything not supplied by the club is a labelled placeholder.
7. **Commits:** small, one logical change each, clear message. No AI co-author or "generated with" trailers.
8. **This is Next.js 16** (see the block at the top): read `node_modules/next/dist/docs/` before using an API you remember from older versions.
9. **Security testing** requested by Haise-727 is authorised (`docs/SECURITY-TESTING.md`). Follow its scope, budgets (free plans) and rules; prefer the staging project.
10. The developer's PC clock has been wrong before. For anything time-sensitive in tests, use the database server's time.

## Recipes
- **New field on events:** migration (column + constraint) → `forms.ts` (form → row) → `components/event-form.tsx` → `snapshot.ts` → `contract.ts` here **and** in fable-site → fable-site `src/lib/content.ts` and the page. Tests at each step.
- **Give someone access:** CMS → People (owners). In SQL: `insert into admins (github_username, role, added_by) values ('lowercase-login', 'creator', 'you');`
- **Publish from a terminal:** `npx tsx scripts/publish-now.mts "note"`.
- **Locked out, lost a key, deleted data:** `docs/RECOVERY.md`.
