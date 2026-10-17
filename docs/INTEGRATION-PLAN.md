# Implementation plan: CMS to public site

Status: **plan only.** Nothing in this document is built yet. Written 2026-10-17 from the club's pipeline description.

## 1. The pipeline (as described)
1. Editors use the CMS to add **events**, **members** and the **data shared with event participants** (the hub).
2. They click **Publish**.
3. The public site updates as planned before: one rebuild, reading the database once; the site stays static.
4. The people already on the board and the faculty stay **hardcoded in the site repo**. Only the **exclusive members page** follows the CMS.
5. Every detail that may not be known yet has a **placeholder option** (choose a month, or write your own text).
6. CMS UI stays **simple**, in the main site's theme.

## 2. What lives where

| Thing | Source of truth | Why |
|---|---|---|
| Faculty and board (home people stage, contact section) | Hardcoded in the site repo (`content/members/*.json`, unchanged) | They rarely change and shouldn't depend on the database |
| General members (the `/members` page) | **CMS** | Changes often, many people |
| Events (home, `/events`, event pages, timeline) | **CMS** | Core use case |
| Hub posts per event (links, files, updates) | **CMS** (stored on the event) | Published content, appears after Publish |
| Join-form applications | Written straight to Supabase by the site; read in the CMS (separate phase) | Live data, not published content |
| Club details, aims | CMS later (kept in the repo until then) | Low priority |

`/members` shows two groups: the hardcoded **Faculty / Board** (as now) and the CMS-driven **Members**.

## 3. Flexible ("not decided yet") details

Every uncertain field uses one small control with a **mode** switch. Suggested defaults shown in bold.

| Field | Modes |
|---|---|
| **Date** | **Exact** (start + optional end) · **Month only** (pick a month) · **Own text** (e.g. "Early February", with an optional month for timeline placement) · **To be announced** |
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

- 2026-10-17 done: data contract + date/status rules + tests (`src/lib/contract.ts`, `event-logic.ts`); migration 0004 written and applied by the user; snapshot builder `src/lib/snapshot.ts` with tests (44 tests passing); Sharann added as CMS owner; `docs/ACCESS.md`.
- Next: seed script (5 placeholder events, 3 placeholder members, writes `fable-site/content/seed/snapshot.json`), then site side (copy contract, pull script, `content.ts` rewrite, UI states), then publish core, CMS screens, live tests.
- The user allows the assistant to apply Supabase migrations itself from now on (service key in `.env.local`; keep secrets out of chat).
- Commits: small and focused, never add a Claude co-author trailer (user rule, overrides any default).
