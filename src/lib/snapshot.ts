import { SCHEMA_VERSION, Snapshot, SnapshotEvent, SnapshotMember } from "@/lib/contract";
import { videoPoster } from "@/lib/media";
import type { z } from "zod";

// ---- database rows (only the columns the snapshot needs) --------------------------------

export type EventRow = {
  id: number;
  slug: string;
  title: string;
  kind: string;
  phase: number;
  status_override: "active" | "upcoming" | "past" | null;
  date_mode: "exact" | "month" | "text" | "tba";
  start_date: string | null;
  end_date: string | null;
  date_month: string | null;
  date_text: string | null;
  time_mode: "text" | "tba";
  time_text: string;
  venue_mode: "text" | "online" | "tba";
  venue: string;
  seats_mode: "text" | "open" | "tba";
  seats: string | null;
  apply_mode: "form" | "link" | "soon" | "closed" | "none";
  apply_url: string | null;
  summary: string;
  description: string;
  highlights: string[];
  art: string;
  photo_path: string | null;
  /** media.id list: at most 1 video + 2 pictures, display order (migration 0015). */
  media_ids?: number[];
  hub: unknown;
  archived: boolean;
  /** Saved but not ready: never published. Creators can only save drafts; admins take them live. */
  draft?: boolean;
  /** Official VIT EventHub page (migration 0007). */
  eventhub_url?: string | null;
  /** Approved VIT OD slots (migration 0018). */
  od_slots?: string[];
};

/** A question asked on the site (migration 0007). Only answered, shown, not-hidden ones reach the release. */
export type QuestionRow = {
  id: number;
  created_at: string;
  event_slug: string;
  question: string;
  answer: string | null;
  show_on_site: boolean;
  hidden: boolean;
};

/** The FAQ for one event: answered questions the club chose to show, oldest first. */
export function faqFor(slug: string, questions: QuestionRow[]) {
  return questions
    .filter((q) => q.event_slug === slug && q.show_on_site && !q.hidden && blank(q.answer) !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    .map((q) => ({ question: q.question.trim(), answer: (q.answer ?? "").trim() }));
}

export type MemberRow = {
  id: number;
  slug: string;
  name: string;
  role: string;
  group: string;
  position: number;
  department: string;
  year_mode: "pick" | "text" | "none";
  year: string;
  bio: string;
  focus: string[];
  email: string;
  show_email: boolean;
  linkedin: string | null;
  github: string | null;
  art: string;
  photo_path: string | null;
  /** media.id of the photo (migration 0015). */
  photo_id?: number | null;
  archived: boolean;
};

/** A row of the `media` table (only what the snapshot needs). */
export type MediaRow = {
  id: number;
  kind: string;
  provider: string;
  url: string | null;
  width: number | null;
  height: number | null;
  duration: number | string | null;
};
export type MediaById = Map<number, MediaRow>;

export type Problem = { entity: "event" | "member" | "release"; label: string; field: string; message: string };
export type BuildResult = { ok: true; snapshot: Snapshot } | { ok: false; problems: Problem[] };

const blank = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v.trim());

/** Public URL of a file in the `media` storage bucket. */
export function mediaUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  const p = blank(path);
  return p ? `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/media/${p.replace(/^\/+/, "")}` : null;
}

// ---- row -> snapshot candidates (validated afterwards) -----------------------------------

/** One media row as the snapshot carries it. Rows that are missing or not on ImageKit are left out. */
function mediaItem(m: MediaRow | undefined) {
  if (!m || m.provider !== "imagekit" || !m.url) return null;
  const video = m.kind === "video";
  return {
    kind: video ? "video" : "image",
    url: m.url,
    width: m.width,
    height: m.height,
    duration: video && m.duration != null ? Number(m.duration) : null,
    poster: video ? videoPoster(m.url) : null,
  } as const;
}

/** An event's media in display order: the linked rows, the video first, then the pictures in their order. */
export function eventMedia(ids: number[] | null | undefined, media: MediaById) {
  const items = (ids ?? []).map((id) => mediaItem(media.get(Number(id)))).filter((m) => m !== null);
  return [...items.filter((m) => m.kind === "video"), ...items.filter((m) => m.kind === "image")];
}

function hubItems(raw: unknown) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((h) => {
      const o = (h ?? {}) as Record<string, unknown>;
      return {
        kind: o.kind,
        title: typeof o.title === "string" ? o.title.trim() : o.title,
        body: blank(o.body as string | null),
        href: blank(o.href as string | null),
        posted_at: o.posted_at,
        posted_by: typeof o.posted_by === "string" ? o.posted_by.trim() : o.posted_by,
      };
    })
    .sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)));
}

export function eventCandidate(r: EventRow, supabaseUrl: string, questions: QuestionRow[] = [], media: MediaById = new Map()) {
  const items = eventMedia(r.media_ids, media);
  const date =
    r.date_mode === "exact"
      ? { mode: "exact", start: r.start_date, end: r.end_date }
      : r.date_mode === "month"
        ? { mode: "month", month: r.date_month }
        : r.date_mode === "text"
          ? { mode: "text", text: r.date_text, month: r.date_month, place: r.start_date }
          : { mode: "tba", place: r.start_date };
  const time = r.time_mode === "text" ? { mode: "text", text: r.time_text } : { mode: "tba" };
  const venue =
    r.venue_mode === "text"
      ? { mode: "text", text: r.venue }
      : r.venue_mode === "online"
        ? { mode: "online", text: blank(r.venue) }
        : { mode: "tba" };
  const seats = r.seats_mode === "text" ? { mode: "text", text: r.seats } : { mode: r.seats_mode };
  const apply = r.apply_mode === "link" ? { mode: "link", url: r.apply_url } : { mode: r.apply_mode };
  return {
    slug: r.slug,
    title: r.title,
    kind: r.kind,
    phase: r.phase,
    status_override: r.status_override,
    date,
    time,
    venue,
    seats,
    apply,
    summary: r.summary,
    description: r.description
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
    highlights: (r.highlights ?? []).map((h) => h.trim()).filter(Boolean),
    art: r.art,
    // picture 1 also stands as the event's single photo (link previews, older site code)
    photo: items.find((m) => m.kind === "image")?.url ?? mediaUrl(supabaseUrl, r.photo_path),
    hub: hubItems(r.hub),
    eventhub: blank(r.eventhub_url),
    faq: faqFor(r.slug, questions),
    media: items,
    od_slots: r.od_slots ?? [],
  };
}

export function memberCandidate(r: MemberRow, supabaseUrl: string, media: MediaById = new Map()) {
  const photo = r.photo_id ? mediaItem(media.get(Number(r.photo_id))) : null;
  return {
    slug: r.slug,
    name: r.name,
    role: blank(r.role) ?? "Member",
    group: r.group,
    order: r.position,
    department: r.department ?? "",
    year: r.year_mode === "none" ? { mode: "none" } : { mode: r.year_mode, text: r.year },
    bio: r.bio ?? "",
    focus: (r.focus ?? []).map((f) => f.trim()).filter(Boolean),
    links: {
      email: r.show_email ? blank(r.email) : null,
      linkedin: blank(r.linkedin),
      github: blank(r.github),
    },
    art: r.art,
    photo: photo?.kind === "image" ? photo.url : mediaUrl(supabaseUrl, r.photo_path),
  };
}

const issuesToProblems = (
  entity: Problem["entity"],
  label: string,
  issues: z.ZodIssue[],
  stripPrefix = 0,
): Problem[] =>
  issues.map((i) => ({ entity, label, field: i.path.slice(stripPrefix).join(".") || "(row)", message: i.message }));

// Sorting: dated events chronologically, undated ones last, then by title.
function startOf(e: z.infer<typeof SnapshotEvent>): string {
  const d = e.date;
  if (d.mode === "exact") return d.start;
  if (d.mode === "month") return `${d.month}-01`;
  if ((d.mode === "text" || d.mode === "tba") && d.place) return d.place;
  if (d.mode === "text" && d.month) return `${d.month}-01`;
  return "9999-12-31";
}

/**
 * Turn the database rows into the published snapshot. Every row is checked on
 * its own so a problem points at the exact event/member and field; if anything
 * is wrong nothing is built.
 */
export function buildSnapshot(
  rows: { events: EventRow[]; members: MemberRow[]; questions?: QuestionRow[]; media?: MediaRow[] },
  opts: { supabaseUrl: string; now?: Date },
): BuildResult {
  const problems: Problem[] = [];
  const events: z.infer<typeof SnapshotEvent>[] = [];
  const members: z.infer<typeof SnapshotMember>[] = [];
  const media: MediaById = new Map((rows.media ?? []).map((m) => [Number(m.id), m]));

  for (const row of rows.events.filter((r) => !r.archived && !r.draft)) {
    const parsed = SnapshotEvent.safeParse(eventCandidate(row, opts.supabaseUrl, rows.questions ?? [], media));
    if (parsed.success) events.push(parsed.data);
    else problems.push(...issuesToProblems("event", row.title || row.slug, parsed.error.issues));
  }

  const memberRows = rows.members
    .filter((r) => !r.archived)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  for (const row of memberRows) {
    const parsed = SnapshotMember.safeParse(memberCandidate(row, opts.supabaseUrl, media));
    if (parsed.success) members.push(parsed.data);
    else problems.push(...issuesToProblems("member", row.name || row.slug, parsed.error.issues));
  }

  if (problems.length) return { ok: false, problems };

  events.sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.title.localeCompare(b.title));

  const whole = Snapshot.safeParse({
    schema_version: SCHEMA_VERSION,
    generated_at: (opts.now ?? new Date()).toISOString(),
    events,
    members,
  });
  if (!whole.success) {
    return {
      ok: false,
      problems: whole.error.issues.map((i) => ({ entity: "release" as const, label: "Release", field: i.path.join("."), message: i.message })),
    };
  }
  return { ok: true, snapshot: whole.data };
}
