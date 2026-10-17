# Roadmap: what is done, what is left, suggestions

Last updated 2026-10-17. How the pieces fit: [ARCHITECTURE.md](ARCHITECTURE.md).

## Is the backend finished?
**Yes for everything the club needs to run: publishing, events, people, sign-ups, access control.** What remains is small and mostly optional:

### Do next (short)
1. **Apply migration 0006** (`supabase/migrations/0006_roles.sql`) in the Supabase SQL editor. It creates the four access levels and draft events. Then push the CMS (the app already understands both the old and the new database).
2. **Give the assistant `DATABASE_URL`** (optional): paste the direct connection string into `fable-cms/.env.local`. It lets migrations run from the terminal and enables `tests/live/roles.live.test.ts`, which proves every level against every table.
3. First real content: replace the placeholder events and people in the CMS, then delete the `placeholder-*` rows (`npx tsx scripts/seed-placeholders.mts --remove`) and press Publish.
4. Add the other people to the CMS (People screen) at the right level, and create the `WebDev-Leads` / `WebDev` GitHub teams (see ACCESS.md).

### Not done yet (backend)
| Item | Notes |
|---|---|
| Media (photos) end to end | Upload control, WebP resize, bucket and rules exist. Needs one real upload test in a signed-in browser. You said later. |
| Participant hub privacy | Hub pages are public to anyone with the link (no per-participant login). Fine for links and announcements; do not post anything private. A real fix is a participant login or a shared event code. |
| Club text and aims in the CMS | They live in `content/club.json` and `aims.json` in the site repo (edit and push). The tables exist; a screen is a small job. |
| Organisation check at sign-in | Optional hardening: also require current GitHub org membership. Needs a server-side GitHub token. |
| Capacity and waitlists | "Seats" is text only. Registrations are not capped. |
| Notifications | No email to editors on a new application or to people who register. |
| Dashboard accuracy | "Unpublished changes" ignores deleted rows. |
| Soft 404 | `/events/<unknown>` answers HTTP 200 with a not-found page (a Next.js streaming detail). |
| Backups | Supabase's free plan has no point-in-time recovery. Download the two CSV exports now and then, or add a scheduled export. |
| Audit log | The table exists; nothing writes to it yet. Releases already record who published. |

### Done
Data contract and date rules (mutation tested) · snapshot builder · publish, retry and rollback · drafts · four access levels (app side, database side written) · events and people screens · applications and registrations (inbox, status, notes, CSV) · People screen with safety rules · live security and publish tests · live site wired to the database.

## Frontend (the site)
Done: static pages from releases, tentative/TBA dates, registration states, "Live now / Registrations open / Next up" announcements, members from the CMS, empty states, stronger "events" buttons, dev server follows new releases.

Still open (all on your side, none blocks the backend):
- **A real 3D object** for "What we're for" (see suggestions). The viewer samples a model into points; the five current shapes are procedural stand-ins.
- **Member backgrounds** for the People section (see suggestions).
- Real copy, photos, and removing the `Placeholder` markers once content is final.
- Fonts licence check before wide launch.

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
