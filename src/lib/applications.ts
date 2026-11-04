// Recruitment applications: the review steps, the screen's filters and the reply drafts.
// Pure, so it is tested without a database (tests/applications.test.ts).

/** The steps an application moves through, in order. The database allows exactly these (migration 0008). */
export const APP_STATUSES = ["new", "reviewed", "shortlisted", "accepted", "rejected"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];
export const STATUS_LABEL: Record<AppStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  shortlisted: "Invited to chat",
  accepted: "Accepted",
  rejected: "Not selected",
};

/** The teams applicants pick from on the Join page (fable-site src/lib/submissions.ts). */
export const TEAMS = ["Web Development", "Agentic AI", "Projects", "Operations", "Finance", "Creative & Communications", "Not sure yet"] as const;

/** The intake the site files new applications under (fable-site content/club.json, recruitment.intake). */
export const CURRENT_INTAKE = "2026-27";
export const CLUB_EMAIL = "contact@thefableclub.com";

export type Application = {
  id: number;
  created_at: string;
  intake: string | null;
  name: string;
  reg_no: string;
  email: string;
  phone: string | null;
  department: string;
  year: string;
  team: string | null;
  build: string | null;
  why: string;
  task: string | null;
  level?: string | null;
  tracks?: string[] | null;
  status: string;
  notes: string | null;
};

export type AppFilters = { status: AppStatus | "all"; team: string | "all"; intake: string | "all"; q: string };

const isStatus = (s: string): s is AppStatus => (APP_STATUSES as readonly string[]).includes(s);

/** Read the filters from the address bar, ignoring anything unexpected. Defaults: everyone in the current intake. */
export function parseFilters(p: { status?: string; team?: string; intake?: string; q?: string }): AppFilters {
  const status = p.status && isStatus(p.status) ? p.status : "all";
  const team = p.team && (TEAMS as readonly string[]).includes(p.team) ? p.team : "all";
  const intake = p.intake === "all" ? "all" : p.intake && /^[A-Za-z0-9-]{1,40}$/.test(p.intake) ? p.intake : CURRENT_INTAKE;
  const q = (p.q ?? "").trim().slice(0, 80);
  return { status, team, intake, q };
}

export function matches(a: Application, f: AppFilters, opts: { ignoreStatus?: boolean } = {}): boolean {
  if (!opts.ignoreStatus && f.status !== "all" && a.status !== f.status) return false;
  if (f.team !== "all" && a.team !== f.team) return false;
  if (f.intake !== "all" && a.intake !== f.intake) return false;
  if (f.q) {
    const needle = f.q.toLowerCase();
    if (![a.name, a.reg_no, a.email, a.department].some((v) => v?.toLowerCase().includes(needle))) return false;
  }
  return true;
}

/** How many applications sit at each step (for the filter chips), counting only what the other filters let through. */
export function countByStatus(rows: Application[], f: AppFilters): Record<AppStatus | "all", number> {
  const out = { all: 0, new: 0, reviewed: 0, shortlisted: 0, accepted: 0, rejected: 0 };
  for (const r of rows) {
    if (!matches(r, f, { ignoreStatus: true })) continue;
    out.all++;
    if (isStatus(r.status)) out[r.status]++;
  }
  return out;
}

/** The address-bar query for a set of filters (default values left out). */
export function filterQuery(f: AppFilters, change: Partial<AppFilters> = {}): string {
  const n = { ...f, ...change };
  const p = new URLSearchParams();
  if (n.status !== "all") p.set("status", n.status);
  if (n.team !== "all") p.set("team", n.team);
  if (n.intake !== CURRENT_INTAKE) p.set("intake", n.intake);
  if (n.q) p.set("q", n.q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** A WhatsApp chat link for an Indian mobile number as people type it ("98765 43210", "+91-98765-43210"). */
export function whatsappLink(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? `https://wa.me/${d}` : null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Reply drafts for each decision. They open in the editor's own mail app, copied to the club mailbox. */
export const REPLIES = {
  shortlisted: {
    label: "Invite to a chat",
    subject: "The Fable Club: a short chat about your application",
    body: (a: Application) =>
      `Hi ${firstName(a.name)},\n\nThanks for applying to The Fable Club. We enjoyed reading your answers and would like to have a short chat with you, about 10 minutes.\n\nPlease reply with two or three times that suit you this week.\n\nThe Fable Club core board`,
  },
  accepted: {
    label: "Welcome email",
    subject: "Welcome to The Fable Club",
    body: (a: Application) =>
      `Hi ${firstName(a.name)},\n\nGood news: you are in. Welcome to The Fable Club!\n\nWe will send the details of the first session soon. Until then, reply to this email if you have any questions.\n\nThe Fable Club core board`,
  },
  rejected: {
    label: "Not-selected email",
    subject: "Your application to The Fable Club",
    body: (a: Application) =>
      `Hi ${firstName(a.name)},\n\nThank you for applying to The Fable Club and for the time you put into your answers. After reading every application, we are not able to offer you a place in this intake.\n\nWe hope to see you at our events.\n\nThe Fable Club core board`,
  },
} as const;
export type ReplyKind = keyof typeof REPLIES;

/** The alert the club mailbox gets for each new application (sent by /api/hooks/new-application). */
export function newApplicationMail(a: Application, cmsUrl = "https://cms.thefableclub.com"): { subject: string; text: string } {
  const line = (label: string, v: string | null | undefined) => (v ? `${label}: ${v}` : null);
  const text = [
    `${a.name} applied to The Fable Club${a.intake ? ` (${a.intake} intake)` : ""}.`,
    "",
    line("Reg. no.", a.reg_no),
    line("Email", a.email),
    line("Phone", a.phone),
    line("Department", a.department),
    line("Year", a.year),
    line("Team", a.team),
    "",
    line("What they want to build", a.build),
    "",
    line("Why they want to join", a.why),
    "",
    line("Short task", a.task),
    "",
    `Open it in the CMS: ${cmsUrl}/applications${filterQuery({ status: "all", team: "all", intake: a.intake ?? "all", q: a.reg_no })}`,
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n"); // a section with nothing in it leaves no gap
  return { subject: `New application: ${a.name}${a.team ? ` (${a.team})` : ""}`, text };
}

export function replyMailto(kind: ReplyKind, a: Application): string {
  const r = REPLIES[kind];
  const q = new URLSearchParams({ cc: CLUB_EMAIL, subject: r.subject, body: r.body(a) });
  // mail apps expect %20, not "+", for spaces
  return `mailto:${encodeURIComponent(a.email)}?${q.toString().replace(/\+/g, "%20")}`;
}
