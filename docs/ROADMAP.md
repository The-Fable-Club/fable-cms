# Roadmap: what is done, what is left, suggestions

Last updated 2026-11-04. How the pieces fit: [ARCHITECTURE.md](ARCHITECTURE.md).

Open work is tracked as GitHub issues: [CMS](https://github.com/The-Fable-Club/fable-cms/issues) and [site](https://github.com/The-Fable-Club/fable-site/issues). The tables below are the background.

## Is the backend finished?
**Yes for everything the club needs to run: publishing, events, people, sign-ups, access control.** What remains is small and mostly optional:

### Do next (short)
0. Migrations 0001-0014 are applied. New migrations go to the **staging** project first (`npm run db:staging -- --file ...`), then production after `npm run backup`. There is now a staging Supabase project for tests and security work (`npm run dev:staging`, `test:live:staging`): see [SECURITY-TESTING.md](SECURITY-TESTING.md) section 5.
1. **Apply migration 0006** (`supabase/migrations/0006_roles.sql`) in the Supabase SQL editor. It creates the four access levels and draft events. Then push the CMS (the app already understands both the old and the new database).
2. **Give the assistant `DATABASE_URL`** (optional): paste the direct connection string into `fable-cms/.env.local`. It lets migrations run from the terminal and enables `tests/live/roles.live.test.ts`, which proves every level against every table.
3. First real content: replace the placeholder events and people in the CMS, then delete the `placeholder-*` rows (`npx tsx scripts/seed-placeholders.mts --remove`) and press Publish.
4. Add the other people to the CMS (People screen) at the right level, and create the `WebDev-Leads` / `WebDev` GitHub teams (see ACCESS.md).

### Not done yet (backend)
| Item | Notes |
|---|---|
| College-format fields | The club wants event and member details adjusted to the college's formats; needs the list of fields first. |
| Media (photos and clips) | Moving to ImageKit, with the media table as the record: [#1](https://github.com/The-Fable-Club/fable-cms/issues/1). **Foundation done 2026-11-04:** migration 0014 (media columns) applied, signing route in review ([#21](https://github.com/The-Fable-Club/fable-cms/pull/21)). Left: the upload field in the forms, snapshot/contract change in both repos, the site loader + Events stage, and the clean-up sweep. |
| Atomic publish | **Done (2026-11-03):** migration 0009 applied; `publish_release()` lets one publisher through at a time under an advisory lock. [#3](https://github.com/The-Fable-Club/fable-cms/issues/3) |
| Participant hub privacy | Decided to stay public (no student accounts), so participants can download materials. Do not post anything private in a hub. |
| Club text and aims in the CMS | They live in `content/club.json` and `aims.json` in the site repo (edit and push). The tables exist; a screen is a small job. |
| Organisation check at sign-in | Optional hardening: also require current GitHub org membership. Needs a server-side GitHub token. |
| Capacity and waitlists | "Seats" is text only. Registrations are not capped. |
| Notifications | **Built (2026-11-03):** each new application emails contact@thefableclub.com (migration 0010, Resend). No email to people who register. |
| Dashboard accuracy | "Unpublished changes" ignores deleted rows. |
| Soft 404 | `/events/<unknown>` answers HTTP 200 with a not-found page (a Next.js streaming detail). |
| Backups | **Built:** `npm run backup` saves every table to `backups/` (git-ignored), `npm run restore` puts rows back; lock-out guard (0011); runbook in [RECOVERY.md](RECOVERY.md). Still manual: run it weekly and before migrations. A scheduled backup is a possible next step. |
| Audit log | The table exists; nothing writes to it yet. Releases already record who published. |
| Event attendance for OD | **Screens only (no backend)** in the CMS and on the site, for the club member building it. Roster = EventHub CSV + logged on-spot additions. Needs a sample EventHub CSV and the OD format. [ATTENDANCE-FEASIBILITY.md](ATTENDANCE-FEASIBILITY.md) |
| Event questions / FAQ | **Built:** ask under each event -> CMS Questions -> answer -> optional email -> optional public FAQ after Publish; delete in the CMS. Email sending needs `RESEND_API_KEY` + `MAIL_FROM`. [EVENT-QA.md](EVENT-QA.md) |
| Official VIT EventHub registration | **Built:** EventHub link per event, poster short link + QR. No VTOP credentials, payments, deeper integration or student accounts; hub stays public; our own form stays for now. [EVENTHUB.md](EVENTHUB.md) |

### Done
Data contract and date rules (mutation tested) · snapshot builder · publish, retry and rollback · drafts · four access levels (app side, database side written) · events and people screens · applications and registrations (inbox, status, notes, CSV) · People screen with safety rules · live security and publish tests · live site wired to the database.

## Frontend (the site)
Done: static pages from releases, tentative/TBA dates, registration states, "Live now / Registrations open / Next up" announcements, members from the CMS, empty states, stronger "events" buttons, dev server follows new releases.

Still open (all on your side, none blocks the backend):
- **A real 3D object** for "What we're for" (see suggestions). The viewer samples a model into points; the five current shapes are procedural stand-ins.
- ~~Member backgrounds~~ built (generated SVG motifs, slowly drifting).
- Real copy, photos, and removing the `Placeholder` markers once content is final.
- Fonts: used as they are (the club's call, 2026-11-02).

## Suggestions
### Free 3D objects
The viewer turns a mesh into a point cloud, so it needs a **GLB / glTF or OBJ**, a few thousand to 50k triangles is plenty. Check the licence of each (CC0 needs nothing; CC-BY needs credit in the footer).
- **Poly Pizza** (poly.pizza): thousands of low-poly models, mostly CC0/CC-BY, downloads as GLB. Best first stop.
- **Kenney** (kenney.nl/assets) and **Quaternius** (quaternius.com): CC0 packs, clean style, GLB/OBJ.
- **Sketchfab** (sketchfab.com): filter by "Downloadable" and a CC licence; download glTF.
- **Smithsonian 3D** (3d.si.edu) and **NASA 3D Resources** (nasa.gov/3d-resources): public-domain real objects (satellites, fossils).
- **Khronos glTF sample models** (github.com/KhronosGroup/glTF-Sample-Models): test models, all permissive.
- Or have the assistant model one in code from the club's sprout mark (no licence question at all, and it matches the brand).

### Member backgrounds (People section)
- **Generate them in code, one motif per group**, in the club's palette so they match the site and need no licensing: web dev -> code brackets and grid, agentic AI -> node graph, operations -> interlocking rings, finance -> stacked bars, creative -> overlapping shapes, technical -> circuit lines, leadership -> sprout and concentric rings. The assistant can build these as SVG components, animated with the site's easing. This is the recommendation.
- If you want illustrations instead: **unDraw / Open Peeps / Humaaans** (free, attribution-friendly), **heropatterns.com** and **haikei.app** (free SVG patterns and shapes), or a custom set from a designer later.

### Process
- Tag the live commit of each repo as a checkpoint (`checkpoint-1`) before showing others, so you can always get back to what they saw.
- Keep test edits on placeholders only; they are reset when the seed script is re-run.
- When real people use the CMS, give most people **Creator** or **Member**, keep **Admin** for the few who publish, and **Owner** for two people.
