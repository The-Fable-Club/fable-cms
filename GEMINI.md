# GEMINI.md — Project Guide for The Fable Club (CMS)

## Project Overview

**fable-cms** is the admin content management system for **The Fable Club** (a student-led Claude and agentic AI learning community at VIT Chennai, hosted at [cms.thefableclub.com](https://cms.thefableclub.com)).
Built with **Next.js 16 (App Router, Turbopack)**, **TypeScript**, **Tailwind CSS v4**, **Supabase (@supabase/ssr, PostgreSQL, Supabase Auth)**, and **Vitest**.

### Dual-Repo Ecosystem
- **`The-Fable-Club/fable-cms`** (this repository): Admin portal where authenticated club organizers manage events, member rosters, recruitment applications, event registrations, and attendee Q&A. Editors trigger a **Publish** to release new snapshots and rebuild the public site.
- **`The-Fable-Club/fable-site`**: The static, public-facing website. Public visitors never query the database while browsing; pages are statically generated from published CMS release snapshots.

---

## Architecture & Data Flow

### 1. Database-Enforced Authorization & Session Proxy
- **Authentication**: Editors authenticate via GitHub OAuth handled by Supabase Auth.
- **Session Proxy Gate**:
  - `src/proxy.ts` delegates to `updateSession()` in `src/lib/supabase/proxy.ts`.
  - Runs on every incoming request, validates/refreshes the Supabase session cookies, and redirects unauthenticated traffic to `/login` (except `/login`, `/auth/*`, `/api/health`).
- **Database-Driven Role Ranks**:
  - Authorization lives in PostgreSQL (`role_rank()` RPC function), reading the un-spoofable GitHub username from `auth.identities` against the `admins` table.
  - Four hierarchical roles (migration `0006_roles.sql`):
    1. **Member** (rank 1): Read-only access to applications, registrations, and questions; CSV exports.
    2. **Creator** (rank 2): Can create events, edit drafts, upload media, and draft Q&A answers.
    3. **Admin** (rank 3): Full management of live events, members, signups, Q&A moderation, and **Publishing**.
    4. **Owner** (rank 4): User role administration (`/admins`), deploy hook retry, and release rollback.
  - Mirrored in application logic via `src/lib/roles.ts` (`can()`, `canSaveEvent()`) and guarded with `requireCan(action)` in `src/lib/auth.ts`.

### 2. Publishing Pipeline (Editor -> Live Site Rebuild)
1. An **Admin** or **Owner** triggers publish from the CMS dashboard (`src/app/(admin)/actions.ts` -> `publishAction`).
2. **Rate Limit Guard**: Enforces at least 60 seconds between publishes (`MIN_SECONDS_BETWEEN_PUBLISHES`).
3. **Data Assembly & Validation**:
   - `buildSnapshot()` in `src/lib/snapshot.ts` loads active events, members, and approved event Q&As.
   - Validates the resulting JSON tree against the strict Zod data contract in `src/lib/contract.ts`. Any schema violation halts the publish and surfaces line-item errors.
4. **Immutable Release Creation**:
   - Inserts snapshot into `releases` table (`schema_version = 1`). History is never rewritten.
5. **Vercel Deploy Hook**:
   - CMS POSTs to `VERCEL_DEPLOY_HOOK_URL`.
   - Vercel rebuilds `The-Fable-Club/fable-site`. During its prebuild, the site fetches the newest release through Supabase's read-only `public_release` view and validates it against the identical contract before compiling static pages.
   - If deploy hook fails, the release remains safely stored in Supabase, and an Owner can invoke `retryDeployAction`.

### 3. Inbound Data Streams (Visitor -> Supabase -> CMS)
- **Recruitment Applications**: Visitors submit to `fable-site` `/api/applications`. Stored in `applications` table. Filtered, reviewed (`new`, `reviewed`, `invited to chat`, `accepted`, `not selected`, `shortlisted`), and exported as CSV in `/applications`.
- **Event Registrations**: Submitted to `fable-site` `/api/registrations`. Guarded by database functions (`event_accepts_registrations()`) and spam triggers. Reviewed in `/registrations`.
- **Event Q&A / FAQs**: Submitted to `fable-site` `/api/questions`. Creators draft answers; Admins choose which answers are published to the public FAQ or emailed to askers via Resend (`RESEND_API_KEY`).

---

## Critical Rules & Invariants

1. **Contract & Logic Parity with `fable-site`**:
   - `src/lib/contract.ts` and `src/lib/event-logic.ts` are **exact copies** between `fable-cms` and `fable-site`.
   - Never update one without applying the identical change in the other repository and bumping `SCHEMA_VERSION` if breaking.
2. **Shared Live Database Caution**:
   - Local development (`npm run dev`) connects to the **same Supabase database** as production.
   - Edits made on localhost persist in the live database. Publishing from localhost triggers a live production site rebuild on Vercel!
3. **Additive Database Migrations**:
   - Migrations in `supabase/migrations/` (0001 through 0008 currently applied) are strictly immutable once executed.
   - New schema changes must be added as sequential migrations (`0009_*.sql`) and tested.
4. **Next.js 16 Conventions**:
   - CMS uses App Router with Server Actions (`"use server"`).
   - `src/proxy.ts` handles session routing.
   - Deprecation notices in `node_modules/next/dist/docs/` must be followed. The auto-generated comment block in `AGENTS.md` must not be deleted or modified.
5. **Git Commit Policy**:
   - **NEVER** run `git commit` automatically unless the user explicitly requests it.
6. **No Secrets in Client Bundles or Git**:
   - `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_DEPLOY_HOOK_URL`, `DATABASE_URL`, and `RESEND_API_KEY` are server-only secrets. Never leak them into client components, git commits, or public outputs.

---

## Repository Map

```
fable-cms/
├── docs/
│   ├── ACCESS.md                  # Detailed 4-level permission breakdown & GitHub org setup
│   ├── ARCHITECTURE.md            # System architecture, data flow, status report
│   ├── ATTENDANCE-FEASIBILITY.md  # Attendance & OD workflow analysis
│   ├── DEPLOY.md / SETUP.md       # Vercel setup, domain routing, GitHub OAuth config
│   ├── EVENTHUB.md                # VIT EventHub link structure & QR poster rules
│   ├── EVENT-QA.md                # Event Q&A / FAQ workflow
│   ├── INTEGRATION-PLAN.md        # Technical decisions and architecture progress log
│   └── ROADMAP.md                 # Current status and remaining tasks
├── public/                        # Static assets (favicons, icons)
├── scripts/
│   ├── db.mjs                     # Direct SQL execution script (requires DATABASE_URL)
│   ├── import-board.mts           # One-off board member import script
│   ├── publish-now.mts            # Command-line release publisher
│   ├── run-live-tests.mjs         # Live test runner against Supabase
│   └── seed-placeholders.mts      # Seeds or clears sample events and members
├── src/
│   ├── app/
│   │   ├── (admin)/               # Authenticated CMS admin shell
│   │   │   ├── actions.ts         # Publish, retry-deploy, republish server actions
│   │   │   ├── content-actions.ts # Events and members save/update server actions
│   │   │   ├── inbox-actions.ts   # Applications/registrations review status updates
│   │   │   ├── admins/            # Manage admin roles (Owner only)
│   │   │   ├── applications/      # Review membership recruitment applications
│   │   │   ├── attendance/        # OD attendance tracker UI (mockup)
│   │   │   ├── events/            # Events listing, editor, and draft management
│   │   │   ├── export/            # CSV download routes for applications & registrations
│   │   │   ├── members/           # Club member roster management & reordering
│   │   │   ├── questions/         # Event Q&A inbox and answer moderation
│   │   │   ├── registrations/     # Event sign-ups listing and triage
│   │   │   ├── releases/          # Release history, rebuild retry, and rollback
│   │   │   ├── layout.tsx         # Sidebar navigation, admin session header
│   │   │   └── page.tsx           # Dashboard with publish panel & status counts
│   │   ├── api/health/            # Healthcheck route
│   │   ├── auth/                  # Supabase OAuth callback and signout handlers
│   │   ├── login/                 # Login screen with GitHub OAuth trigger
│   │   └── globals.css            # Tailwind CSS v4 styling
│   ├── components/                # Modular form components (event-form, member-form, publish-panel, etc.)
│   ├── lib/
│   │   ├── admins.ts              # Admin role assignment logic
│   │   ├── applications.ts        # Recruitment application statuses and review filters
│   │   ├── auth.ts                # getAdmin(), requireAdmin(), requireCan()
│   │   ├── contract.ts            # Canonical data contract (PARITY WITH fable-site)
│   │   ├── csv.ts                 # CSV generation helpers
│   │   ├── env.ts                 # Public environment variable validation
│   │   ├── event-logic.ts         # Event status calculations (PARITY WITH fable-site)
│   │   ├── forms.ts               # Form parsing and validation logic
│   │   ├── inbox.ts               # Shared signup triage logic
│   │   ├── mail.ts                # Resend email client integration
│   │   ├── publish.ts             # Core publish, snapshot, and deploy hook logic
│   │   ├── publish-server.ts      # Server-side dependencies for publish
│   │   ├── questions.ts           # Q&A data processing and Resend answer emails
│   │   ├── roles.ts               # 4-tier role hierarchy matrix and navigation mapping
│   │   ├── snapshot.ts            # Compiles DB rows into validated contract Snapshot
│   │   └── supabase/              # Supabase server, client, and proxy session factories
│   └── proxy.ts                   # Next.js proxy route entry point
├── supabase/
│   └── migrations/                # SQL migrations 0001-0008 (see migrations/README.md)
└── tests/                         # Vitest unit & live suites
    ├── live/                      # Live integration tests (tested against Supabase)
    └── *.test.ts                  # Unit tests for contract, roles, forms, publish, etc.
```

---

## Verification & Workflow Commands

```bash
# Install dependencies
npm install

# Run unit tests (offline, contract, roles, forms, snapshot)
npm test

# Run a specific unit test
npx vitest run tests/contract.test.ts

# Run live integration tests (requires real Supabase setup)
npm run test:live

# Run linter
npm run lint

# Start local CMS development server (default port 3001)
npm run dev -- -p 3001

# Build for production
npm run build
```

---

## Environment Variables (`.env.local`)

To run the CMS locally, create `.env.local` based on `.env.example`:

```env
# Required for development:
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_... (or legacy anon key)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_... (or legacy service_role key)
VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/...

# Login & Access Control:
ADMIN_GITHUB_USERNAMES=<your-github-username>
GITHUB_REPO=The-Fable-Club/fable-site

# Optional / Specific tools:
DATABASE_URL=postgresql://postgres:<password>@... # Only needed for scripts/db.mjs & tests/live/roles.live.test.ts
RESEND_API_KEY=re_...                            # Optional: For sending email replies to event questions
MAIL_FROM="The Fable Club <hello@thefableclub.com>"
```
