// One-off: copy the faculty / board / leads from the site repo (content/members/*.json) into the
// database, so they are managed in the CMS from now on. Safe to run again (matches on slug).
//   npx tsx scripts/import-board.mts
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

process.loadEnvFile(resolve(import.meta.dirname, "../.env.local"));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DIR = resolve(import.meta.dirname, "../../fable-site/content/members");

type Raw = { name: string; role: string; group: string; order: number; department: string; year: string; bio: string; focus: string[]; email: string; linkedin: string; github: string; art: string; photo: string | null };

const rows = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const m = JSON.parse(readFileSync(resolve(DIR, f), "utf8")) as Raw;
    return {
      slug: f.replace(/\.json$/, ""),
      name: m.name,
      role: m.role,
      group: m.group,
      position: m.order,
      department: m.department,
      year_mode: m.year ? "text" : "none",
      year: m.year ?? "",
      bio: m.bio,
      focus: m.focus,
      email: m.email,
      show_email: Boolean(m.email), // the site showed these before; keep that
      linkedin: m.linkedin || null,
      github: m.github || null,
      art: m.art,
      photo_path: null, // no photos yet
      archived: false,
    };
  });

const res = await fetch(`${URL}/rest/v1/members?on_conflict=slug`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal", "User-Agent": "node" },
  body: JSON.stringify(rows),
});
if (!res.ok) {
  console.error(res.status, await res.text());
  process.exit(1);
}
console.log(`imported ${rows.length} people (${[...new Set(rows.map((r) => r.group))].join(", ")})`);
