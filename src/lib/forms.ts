// Turns a submitted edit form into a database row, and checks it with the SAME
// rules the published snapshot uses, so a problem is caught when saving rather
// than when publishing. Pure: no database, easy to test.
import { SnapshotEvent, SnapshotMember } from "@/lib/contract";
import { eventCandidate, memberCandidate, type EventRow, type MemberRow } from "@/lib/snapshot";

export type FormErrors = Record<string, string>;
export type Parsed<R> = { ok: true; row: R } | { ok: false; errors: FormErrors };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const orNull = (v: string) => (v === "" ? null : v);
const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(v) ? (v as T) : fallback);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// zod issue path -> the form field it belongs to
const EVENT_FIELD: Record<string, string> = {
  "date.start": "start_date", "date.end": "end_date", "date.month": "date_month", "date.text": "date_text", "date.place": "date_place", date: "date_mode",
  "time.text": "time_text", "venue.text": "venue", "seats.text": "seats", "apply.url": "apply_url",
};
const MEMBER_FIELD: Record<string, string> = {
  "year.text": "year_text", "links.email": "email", "links.linkedin": "linkedin", "links.github": "github",
};

function collect(issues: { path: PropertyKey[]; message: string }[], map: Record<string, string>): FormErrors {
  const errors: FormErrors = {};
  for (const i of issues) {
    const path = i.path.map(String);
    const key = path.length > 1 && /^\d+$/.test(path[1]) ? path[0] : path.join(".");
    const field = map[key] ?? map[path[0]] ?? path[0] ?? "form";
    errors[field] ??= i.message;
  }
  return errors;
}

export function parseEventForm(f: FormData, supabaseUrl = "https://x.supabase.co"): Parsed<Omit<EventRow, "id">> {
  const title = str(f, "title");
  // "month" is no longer offered; a stale form that still sends it is read as an exact date and fails the checks.
  const date_mode = pick(str(f, "date_mode"), ["exact", "text", "tba"] as const, "exact");
  const time_mode = pick(str(f, "time_mode"), ["text", "tba"] as const, "text");
  const venue_mode = pick(str(f, "venue_mode"), ["text", "online", "tba"] as const, "text");
  const seats_mode = pick(str(f, "seats_mode"), ["text", "open", "tba"] as const, "text");
  const apply_mode = pick(str(f, "apply_mode"), ["form", "link", "soon", "closed", "none"] as const, "none");

  let hub: unknown = [];
  try {
    hub = JSON.parse(str(f, "hub") || "[]");
  } catch {
    return { ok: false, errors: { hub: "The updates list could not be read. Reload the page and try again." } };
  }

  // Only the fields that belong to the chosen mode are kept; the rest are cleared.
  const row: Omit<EventRow, "id"> = {
    slug: str(f, "slug") || slugify(title),
    title,
    kind: str(f, "kind") || "Event",
    phase: Number(str(f, "phase") || 1),
    status_override: (["active", "upcoming", "past"] as const).find((v) => v === str(f, "status_override")) ?? null,
    date_mode,
    // exact: the real start. text / tba: start_date holds the hidden placeholder date that positions it on the timeline.
    start_date: date_mode === "exact" ? orNull(str(f, "start_date")) : orNull(str(f, date_mode === "text" ? "date_place_text" : "date_place_tba")),
    end_date: date_mode === "exact" ? orNull(str(f, "end_date")) : null,
    date_month: null,
    date_text: date_mode === "text" ? orNull(str(f, "date_text")) : null,
    time_mode,
    time_text: time_mode === "text" ? str(f, "time_text") : "",
    venue_mode,
    venue: venue_mode === "text" ? str(f, "venue") : venue_mode === "online" ? str(f, "venue_online") : "",
    seats_mode,
    seats: seats_mode === "text" ? orNull(str(f, "seats")) : null,
    apply_mode,
    apply_url: apply_mode === "link" ? orNull(str(f, "apply_url")) : null,
    summary: str(f, "summary"),
    description: String(f.get("description") ?? "").replace(/\r\n/g, "\n").trim(),
    highlights: String(f.get("highlights") ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
    art: str(f, "art") || "sprouts",
    photo_path: orNull(str(f, "photo_path")),
    hub,
    archived: f.get("archived") === "on",
    draft: f.get("draft") === "on",
  };

  const check = SnapshotEvent.safeParse(eventCandidate({ ...row, id: 0 }, supabaseUrl));
  if (!check.success) return { ok: false, errors: collect(check.error.issues, EVENT_FIELD) };
  return { ok: true, row };
}

export function parseMemberForm(f: FormData, supabaseUrl = "https://x.supabase.co"): Parsed<Omit<MemberRow, "id">> {
  const name = str(f, "name");
  const year_mode = pick(str(f, "year_mode"), ["pick", "text", "none"] as const, "pick");
  const row: Omit<MemberRow, "id"> = {
    slug: str(f, "slug") || slugify(name),
    name,
    role: str(f, "role"),
    group: pick(str(f, "group"), ["Faculty", "Board", "Leads", "Member"] as const, "Member"),
    position: Number(str(f, "position") || 100),
    department: str(f, "department"),
    year_mode,
    year: year_mode === "pick" ? str(f, "year") : year_mode === "text" ? str(f, "year_text") : "",
    bio: String(f.get("bio") ?? "").trim(),
    focus: str(f, "focus").split(",").map((s) => s.trim()).filter(Boolean),
    email: str(f, "email"),
    show_email: f.get("show_email") === "on",
    linkedin: orNull(str(f, "linkedin")),
    github: orNull(str(f, "github")),
    art: str(f, "art") || "sprouts",
    photo_path: orNull(str(f, "photo_path")),
    archived: f.get("archived") === "on",
  };
  const check = SnapshotMember.safeParse(memberCandidate({ ...row, id: 0 }, supabaseUrl));
  if (!check.success) return { ok: false, errors: collect(check.error.issues, MEMBER_FIELD) };
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return { ok: false, errors: { email: "That doesn't look like an email address." } };
  if (!Number.isInteger(row.position)) return { ok: false, errors: { position: "Use a whole number." } };
  return { ok: true, row };
}
