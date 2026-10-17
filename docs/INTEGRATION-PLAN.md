# Implementation plan: CMS to public site

Status: **built and live** (see the progress log at the bottom, and [ARCHITECTURE.md](ARCHITECTURE.md) for the current picture). Written 2026-10-17 from the club's pipeline description; sections 1-10 are the original plan and some details changed along the way (the board and faculty also moved into the CMS; "month only" dates were replaced by placeholder placement).

## 1. The pipeline (as described)
1. Editors use the CMS to add **events**, **members** and the **data shared with event participants** (the hub).
2. They click **Publish**.
3. The public site updates as planned before: one rebuild, reading the database once; the site stays static.
4. Everyone (faculty, board, leads, members) is managed in the CMS. (Originally the board was to stay hardcoded; changed on 2026-10-17.)
5. Every detail that may not be known yet has a **placeholder option** (choose a month, or write your own text).
6. CMS UI stays **simple**, in the main site's theme.

## 2. What lives where

| Thing | Source of truth | Why |
|---|---|---|
| Faculty, board and leads (home people stage, contact section, first groups on `/members`) | **CMS** (moved from the site repo on 2026-10-17; the site no longer has `content/members`) | The user wanted one place to manage everyone |
| General members (last group on `/members`) | **CMS** | Changes often, many people |
| Events (home, `/events`, event pages, timeline) | **CMS** | Core use case |
| Hub posts per event (links, files, updates) | **CMS** (stored on the event) | Published content, appears after Publish |
| Join-form applications | Written straight to Supabase by the site; read in the CMS (separate phase) | Live data, not published content |
| Club details, aims | CMS later (kept in the repo until then) | Low priority |

`/members` shows Faculty, Board, Leads and Members, all from the CMS (the member `group` and `order` fields).

## 3. Flexible ("not decided yet") details

Every uncertain field uses one small control with a **mode** switch. Suggested defaults shown in bold.

| Field | Modes |
|---|---|
| **Date** | **Exact** (start + optional end) · **Write my own** (e.g. "Early February", shown as written, optional hidden placeholder place) · **To be announced** (optional hidden placeholder place that positions it on the timeline; label stays "Date to be announced"). The old "Month only" option was removed on 2026-10-17; old releases that contain it still load. |
| **Time** | **Time text** (e.g. "4:00 – 6:00 pm") · **To be announced** |
| **Venue** | **Text** · **Online** · **To be announced** |
| **Seats / who can join** | **Text** · **Open to all** · **To be announced** |
| **Apply link** | **Link** · **Opening soon** · **Closed** · **Not needed** |
| **Member year** | **Pick** (1st–4th, PG) · **Own text** · **Leave blank** |

How the site shows them:
- "Month only" and "Own text" dates get a **Tentative** tag and appear on the timeline as a **dashed bar across that month**; "To be announced" events are listed under "Date to be announced" and don't sit on the timeline.
- Status stays automatic: a tentative event in a future month is *Open*; once its month ends it becomes *Past*.
- "Opening soon" shows a disabled "Applications open soon" button instead of Apply.

## 4. Data contract (the published snapshot)

One JSON document per release, versioned so the CMS and the site can change independently.

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-10-20T10:00:00Z",
  "events": [{
    "slug": "prompt-engineering-workshop",
    "title": "…", "kind": "Workshop", "phase": 1,
    "status_override": null,
    "date":  { "mode": "exact|month|text|tba", "start": "2026-11-20", "end": null, "month": "2026-11", "text": null },
    "time":  { "mode": "text|tba", "text": "4:00 – 6:00 pm" },
    "venue": { "mode": "text|online|tba", "text": "…" },
    "seats": { "mode": "text|open|tba", "text": null },
    "apply": { "mode": "link|soon|closed|none", "url": "https://…" },
    "summary": "…", "description": ["…"], "highlights": ["…"],
    "art": "pointer", "photo": "https://…/media/…webp",
    "hub": [{ "kind": "announcement|link|file|schedule", "title": "…", "body": "…", "href": "…", "posted_at": "2026-10-20", "posted_by": "…" }]
  }],
  "members": [{ "slug": "…", "name": "…", "role": "Member", "department": "…", "year": {"mode":"pick|text|none","text":"2nd"}, "bio": "…", "links": {}, "photo": "https://…" }]
}
```

The same zod schema validates it in the CMS (before saving a release) and in the site build (before using it). A bad snapshot fails loudly instead of publishing broken pages.

## 5. Changes in the CMS (this repo)
1. **Migration `0003_flexible_details.sql`**: columns for the modes above on `events` and `members` (applied by you in the SQL editor, like 0001).
2. **Screens** (kept plain, site palette, no animations):
   - Events: list (with "unpublished" marker) · create/edit form with the mode controls · hub posts editor · photo upload.
   - Members: list · create/edit · photo upload.
   - Drafts autosave on submit; nothing public changes until Publish.
3. **Publish**: server action → `requireAdmin()` → validate all rows → build snapshot → insert `releases` row → POST the Vercel deploy hook (once) → record the result. Rate limit one publish per minute. Disabled while there are zero changes.
4. **Releases page**: history, who/when, one-click "Re-publish this version" (owner only).
5. **Media upload**: signed upload to the `media` bucket, images only, ≤ 5 MB, resized in the browser to ≤ 1600 px WebP.

## 6. Changes in the public site (`fable-site`)
1. `scripts/pull-snapshot.mjs`, run as `prebuild`: fetch the latest release from the `public_release` view with the **publishable key** (read-only), validate, write `content/generated/snapshot.json`.
2. Failure policy: Supabase unreachable or invalid snapshot means the **build fails** (the live site stays as it was). Local dev may opt into the committed seed content.
3. `src/lib/content.ts`: events and CMS members come from the snapshot; board/faculty from the repo as now; one merged shape for the pages.
4. UI: tentative tags, dashed month bars on the timeline, "To be announced" list, "Applications open soon" state, a **Members** group on `/members`.
5. Placeholder events and members currently in `content/` are removed once the first real release exists; Keystatic is removed last.

## 7. Test plan (nothing is "done" until each passes)

| Layer | Test |
|---|---|
| Snapshot builder | Rows in, expected JSON out, for every mode combination (exact / month / text / tba, etc.) |
| Contract | A valid snapshot parses in both repos; deliberately broken ones are rejected with a clear error |
| Date logic on the site | Tentative-month status flips correctly at month boundaries (fixed "today" in tests) |
| Security | Public key cannot read `releases` rows or any content table; cannot write; a non-admin session is refused by publish; editors cannot do owner-only actions |
| Publish end to end (real) | Script inserts clearly-labelled test rows (`zz-test-…`) → runs the same publish function the button uses → confirms a `releases` row → confirms the Vercel build starts and finishes → fetches the **live URL** and checks the test event and member appear → deletes the test rows → publishes again → checks they are gone |
| Failure | Supabase unreachable during build → build fails, old site stays; invalid data → publish blocked with a message |
| Pages | Browser checks (desktop + phone) of events, an event with each date mode, members page, hub page |
| Not automatable | The GitHub login itself and the form clicks need a real browser session; I will test the logic underneath, and you will click through the forms once while I watch the results |

## 8. Phases and commits (small, one concern each)
1. Flexible-detail types + zod schema (shared contract), with tests.
2. Migration 0003.
3. Snapshot builder + publish action + deploy-hook call (no UI yet), with the real end-to-end test.
4. Site: pull script + `content.ts` merge + tentative-date UI.
5. CMS: events screens.
6. CMS: members screens + photo upload.
7. CMS: hub posts editor.
8. CMS: releases page and rollback.
9. Clean-up: remove placeholders and Keystatic from the site.

## 9. What I need before phase 3
- The Vercel **deploy hook** URL for the public site (goes in `.env.local`, never in chat).
- The public site's live URL (not secret).
- Which first real events to enter, and the first general members, when you have them.

## Progress log (update as work lands)

**State at 2026-10-17 (end of the first build session)**

Built and committed, all with tests (CMS 81 unit tests, site 27):
- Data contract and date/status rules (shared file, copied verbatim to the site).
- CMS: snapshot builder, publish core (validate, save release, trigger Vercel deploy hook, one-per-minute limit), rollback, form parsers, CSV export, admin safety rules; screens for events (mode switches, hub editor, image upload), members, applications, registrations, releases (retry/rollback for owners), people (owners), dashboard Publish.
- Site: reads events and general members from the published release (`scripts/pull-snapshot.mjs` before dev/build, strict on Vercel/CI, seed fallback locally and for a fresh database); tentative/TBA dates, registration states, hero strips (Live now / Registrations open / Next up), empty states; `/api/applications` and `/api/registrations` (zod, honeypot, origin check, size limit, insert-only publishable key).
- Database: migrations 0001-0004 applied. **0005 is written but NOT applied** (see below). Placeholder data (5 events, 3 members) is seeded (`npm run seed`; `npx tsx scripts/seed-placeholders.mts --remove` deletes it).
- Vercel: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` added to the `fable-site` project (Production and Preview).

**Blocked on the user**
1. Run `supabase/migrations/0005_trigger_functions_security_definer.sql` in the Supabase SQL editor. Live tests proved that without it EVERY registration and application is refused (the spam-limit triggers ran with the visitor's rights, and visitors can't read the tables they count). Or put the direct connection string in `.env.local` as `DATABASE_URL` and the assistant can run `node scripts/db.mjs --file ...` itself.
2. Push both repos (fable-site: 16+ commits; fable-cms: ~25 commits). Pushing the site triggers a production build, which now needs the Supabase variables (already set).

**After those, still to do**
- `npm run test:live` should go fully green (security.live.test.ts exists; publish-flow live test not written yet).
- First real Publish from the CMS (needs a GitHub sign-in, so the user clicks it), then verify the live site shows the placeholder events and the Registrations open strip.
- Live end-to-end: add an event in the CMS, Publish, confirm timeline/event page/home strip update after the rebuild; then remove it and publish again.
- Failure drills: bad deploy hook (release saved, retry works), invalid data (nothing published).
- Cleanup (Phase 9): remove placeholders and Keystatic from the site, remove "placeholder" labels once real content exists; update site docs; known gaps: dashboard "unpublished changes" count ignores deleted rows; `/events/<unknown-slug>` answers 200 with a not-found page (Next streaming), not a real 404.
- Optional: org-membership check at CMS sign-in (see ACCESS.md).

**Rules to keep following**: small focused commits, no Claude co-author trailer, secrets never in chat, user pushes (or consents to a push), max motion on the site.

**Update 2026-10-17 (later):** `0005` applied; live security tests pass (20/20). Faculty and board imported into the database (`scripts/import-board.mts`) and published as release #7 BEFORE the site that reads them is pushed (otherwise the home people section would be empty). The publish drill (`tests/live/publish.live.test.ts`) proved add-event -> publish -> real rebuild -> event page and /events update; it is being re-run after the site push. `scripts/publish-now.mts` publishes from the command line.

**Update 2026-10-17 (evening):** TBA / own-text dates can carry a hidden placeholder place (stored in `events.start_date`, no migration); People screen: nobody can change their own access level (enforced server-side); localhost site follows new releases (dev route polls Supabase every ~10s). Known: the seed script resets the placeholder events to their seed values, so test edits to placeholders are overwritten when it is re-run.
