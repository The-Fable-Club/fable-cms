// Fills the database with clearly-labelled PLACEHOLDER events and members, then
// writes the same data as the site's offline fallback snapshot.
//   npx tsx scripts/seed-placeholders.ts           (database + site seed file)
//   npx tsx scripts/seed-placeholders.ts --remove  (delete the placeholders again)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildSnapshot, type EventRow, type MemberRow } from "../src/lib/snapshot";

process.loadEnvFile(resolve(import.meta.dirname, "../.env.local"));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE_SEED = resolve(import.meta.dirname, "../../fable-site/content/seed/snapshot.json");

const base = {
  kind: "Workshop", phase: 1, status_override: null, start_date: null, end_date: null, date_month: null, date_text: null,
  time_mode: "text", time_text: "", venue_mode: "text", venue: "", seats_mode: "open", seats: null,
  apply_mode: "none", apply_url: null, highlights: [] as string[], art: "sprouts", photo_path: null, hub: [] as unknown[], archived: false,
};
const events = [
  { ...base, slug: "placeholder-live-session", title: "Placeholder: Live Session", kind: "Workshop", date_mode: "exact", start_date: "2026-10-15", end_date: "2026-10-30",
    time_text: "4:00 – 6:00 pm", venue: "Placeholder Lab 2, VIT Chennai", apply_mode: "closed", art: "code-window",
    summary: "Placeholder event that is happening right now, to test the Live now state.",
    description: "This is placeholder text.\n\nIt exists only to test how a live event looks.", highlights: ["Live state", "Closed registration"],
    hub: [{ kind: "announcement", title: "Welcome to the placeholder hub", body: "Bring a laptop.", posted_at: "2026-10-16", posted_by: "haise-727" },
          { kind: "link", title: "Placeholder slides", href: "https://example.com/slides", posted_at: "2026-10-17", posted_by: "haise-727" }] },
  { ...base, slug: "placeholder-open-registration", title: "Placeholder: Open Registration", kind: "Hackathon", phase: 2, date_mode: "exact", start_date: "2026-11-21", end_date: "2026-11-22",
    time_text: "9:00 am onwards", venue: "Placeholder Hall, VIT Chennai", seats_mode: "text", seats: "60 seats", apply_mode: "form", art: "network",
    summary: "Placeholder upcoming event with the on-site registration form.", description: "Placeholder text for an upcoming event.\n\nRegistrations go to the database.", highlights: ["Team event", "On-site form"] },
  { ...base, slug: "placeholder-placed-tba", title: "Placeholder: Placed TBA", kind: "Talk", phase: 3, date_mode: "tba", start_date: "2027-01-15", // hidden placeholder place: positions it on the timeline, still says TBA
    time_mode: "tba", venue_mode: "tba", seats_mode: "tba", apply_mode: "soon", art: "book",
    summary: "Placeholder with no date yet, positioned on the timeline.", description: "The date is to be announced, but it sits in January on the timeline." },
  { ...base, slug: "placeholder-own-text-date", title: "Placeholder: Own Text Date", kind: "Workshop", phase: 3, date_mode: "text", date_text: "Early February", start_date: "2027-02-05",
    time_text: "Evening", venue_mode: "online", venue: "Google Meet", apply_mode: "link", apply_url: "https://example.com/form", art: "writing",
    summary: "Placeholder with a typed date and an outside form.", description: "The date is free text, placed on the timeline by a hidden placeholder date." },
  { ...base, slug: "placeholder-date-tba", title: "Placeholder: Date To Be Announced", kind: "Showcase", phase: 4, date_mode: "tba",
    time_mode: "tba", venue_mode: "tba", seats_mode: "tba", apply_mode: "none", art: "party",
    summary: "Placeholder with nothing decided yet.", description: "Nothing is decided. It is listed under Date to be announced." },
];
const members = [
  ["placeholder-member-one", "Placeholder Member One", "Member", "CSE", "pick", "2nd", "sprouts"],
  ["placeholder-member-two", "Placeholder Member Two", "Design Member", "ECE", "text", "Final year", "cursor"],
  ["placeholder-member-three", "Placeholder Member Three", "", "IT", "none", "", "hands-together"],
].map(([slug, name, role, department, year_mode, year, art], i) => ({
  slug, name, role, group: "Member", position: i + 1, department, year_mode, year, bio: "Placeholder member for testing.",
  focus: ["Placeholder"], email: "", show_email: false, linkedin: null, github: null, art, photo_path: null, archived: false,
}));

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "User-Agent": "node" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers as object) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

if (process.argv.includes("--remove")) {
  await rest("events?slug=like.placeholder-*", { method: "DELETE" });
  await rest("members?slug=like.placeholder-*", { method: "DELETE" });
  console.log("placeholders removed from the database");
} else {
  await rest("events?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(events) });
  await rest("members?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(members) });
  const [evRows, memRows] = await Promise.all([rest("events?select=*"), rest("members?select=*")]);
  const built = buildSnapshot({ events: evRows as EventRow[], members: memRows as MemberRow[] }, { supabaseUrl: URL });
  if (!built.ok) { console.error(built.problems); process.exit(1); }
  mkdirSync(dirname(SITE_SEED), { recursive: true });
  writeFileSync(SITE_SEED, JSON.stringify(built.snapshot, null, 2) + "\n");
  console.log(`seeded ${evRows.length} events, ${memRows.length} members; wrote ${SITE_SEED}`);
}
