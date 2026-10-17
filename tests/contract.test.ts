import { describe, expect, it } from "vitest";
import { ApplyInfo, DateInfo, Snapshot, SnapshotEvent, SnapshotMember, VenueInfo } from "@/lib/contract";

const event = (over: Record<string, unknown> = {}) => ({
  slug: "prompt-workshop",
  title: "Prompt Workshop",
  kind: "Workshop",
  phase: 1,
  status_override: null,
  date: { mode: "exact", start: "2026-11-20", end: null },
  time: { mode: "text", text: "4:00 – 6:00 pm" },
  venue: { mode: "text", text: "Lab 2" },
  seats: { mode: "open" },
  apply: { mode: "form" },
  summary: "A practical session.",
  description: ["First paragraph."],
  highlights: ["One", "Two"],
  art: "pointer",
  photo: null,
  hub: [],
  ...over,
});
const member = (over: Record<string, unknown> = {}) => ({
  slug: "ada-l",
  name: "Ada L",
  role: "Member",
  department: "CSE",
  year: { mode: "pick", text: "2nd" },
  bio: "",
  focus: [],
  links: {},
  art: "sprouts",
  photo: null,
  ...over,
});
const snap = (over: Record<string, unknown> = {}) => ({
  schema_version: 1,
  generated_at: "2026-10-17T10:00:00.000Z",
  events: [event()],
  members: [member()],
  ...over,
});
const fails = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => expect(schema.safeParse(v).success).toBe(false);
const passes = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => expect(schema.safeParse(v).success).toBe(true);

describe("DateInfo", () => {
  it("accepts all four modes", () => {
    passes(DateInfo, { mode: "exact", start: "2026-11-20" });
    passes(DateInfo, { mode: "exact", start: "2026-11-20", end: "2026-11-21" });
    passes(DateInfo, { mode: "month", month: "2027-02" });
    passes(DateInfo, { mode: "text", text: "Early February" });
    passes(DateInfo, { mode: "text", text: "Early February", month: "2027-02" });
    passes(DateInfo, { mode: "tba" });
  });
  it("rejects nonsense", () => {
    fails(DateInfo, { mode: "exact", start: "2026-02-30" }); // not a real day
    fails(DateInfo, { mode: "exact", start: "20-11-2026" });
    fails(DateInfo, { mode: "exact", start: "2026-11-20", end: "2026-11-19" }); // ends before it starts
    fails(DateInfo, { mode: "exact" }); // missing start
    fails(DateInfo, { mode: "month", month: "2027-13" });
    fails(DateInfo, { mode: "month", month: "2027-2" });
    fails(DateInfo, { mode: "text", text: "" });
    fails(DateInfo, { mode: "text", text: "   " });
    fails(DateInfo, { mode: "soon" });
    fails(DateInfo, {});
  });
  it("accepts a leap day only in a leap year", () => {
    passes(DateInfo, { mode: "exact", start: "2028-02-29" });
    fails(DateInfo, { mode: "exact", start: "2027-02-29" });
  });
});

describe("other placeholder fields", () => {
  it("venue", () => {
    passes(VenueInfo, { mode: "online" });
    passes(VenueInfo, { mode: "online", text: "Google Meet" });
    passes(VenueInfo, { mode: "tba" });
    fails(VenueInfo, { mode: "text" });
    fails(VenueInfo, { mode: "text", text: "" });
  });
  it("apply: a link needs a real https link", () => {
    passes(ApplyInfo, { mode: "form" });
    passes(ApplyInfo, { mode: "link", url: "https://forms.example/abc" });
    fails(ApplyInfo, { mode: "link" });
    fails(ApplyInfo, { mode: "link", url: "not a url" });
    fails(ApplyInfo, { mode: "link", url: "javascript:alert(1)" });
    fails(ApplyInfo, { mode: "link", url: "ftp://files.example/x" });
  });
});

describe("SnapshotEvent", () => {
  it("accepts a normal event", () => passes(SnapshotEvent, event()));
  it("accepts every placeholder combination", () => {
    passes(SnapshotEvent, event({ date: { mode: "tba" }, time: { mode: "tba" }, venue: { mode: "tba" }, seats: { mode: "tba" }, apply: { mode: "soon" } }));
    passes(SnapshotEvent, event({ date: { mode: "month", month: "2027-03" }, venue: { mode: "online" }, apply: { mode: "link", url: "https://x.example/a" } }));
  });
  it("rejects bad slugs, phases and links", () => {
    fails(SnapshotEvent, event({ slug: "Has Spaces" }));
    fails(SnapshotEvent, event({ slug: "UPPER" }));
    fails(SnapshotEvent, event({ slug: "-leading" }));
    fails(SnapshotEvent, event({ phase: 5 }));
    fails(SnapshotEvent, event({ phase: 1.5 }));
    fails(SnapshotEvent, event({ photo: "javascript:alert(1)" }));
    fails(SnapshotEvent, event({ title: "" }));
    fails(SnapshotEvent, event({ summary: "x".repeat(401) }));
  });
  it("validates hub posts", () => {
    const post = { kind: "link", title: "Slides", href: "https://x.example/s", posted_at: "2026-10-17", posted_by: "haise-727" };
    passes(SnapshotEvent, event({ hub: [post] }));
    passes(SnapshotEvent, event({ hub: [{ ...post, kind: "announcement", href: null, body: "Bring a laptop" }] }));
    fails(SnapshotEvent, event({ hub: [{ ...post, kind: "video" }] }));
    fails(SnapshotEvent, event({ hub: [{ ...post, href: "javascript:alert(1)" }] }));
    fails(SnapshotEvent, event({ hub: [{ ...post, posted_at: "yesterday" }] }));
  });
});

describe("SnapshotMember", () => {
  it("accepts a normal member and optional links", () => {
    passes(SnapshotMember, member());
    passes(SnapshotMember, member({ links: { email: "a@b.co", linkedin: "https://linkedin.example/in/a", github: null } }));
    passes(SnapshotMember, member({ year: { mode: "none" } }));
  });
  it("rejects bad email and links", () => {
    fails(SnapshotMember, member({ links: { email: "nope" } }));
    fails(SnapshotMember, member({ links: { linkedin: "linkedin.com/in/a" } }));
  });
});

describe("Snapshot", () => {
  it("accepts a full snapshot, including empty lists", () => {
    passes(Snapshot, snap());
    passes(Snapshot, snap({ events: [], members: [] }));
  });
  it("rejects a wrong or missing schema version", () => {
    fails(Snapshot, snap({ schema_version: 2 }));
    fails(Snapshot, snap({ schema_version: undefined }));
  });
  it("rejects duplicate slugs and says where", () => {
    const r = Snapshot.safeParse(snap({ events: [event(), event()] }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message.includes("Duplicate slug") && i.path.join(".") === "events.1.slug")).toBe(true);
    fails(Snapshot, snap({ members: [member(), member()] }));
  });
  it("rejects an invalid timestamp", () => fails(Snapshot, snap({ generated_at: "today" })));
  it("does not let a bad event hide inside a valid snapshot", () => {
    fails(Snapshot, snap({ events: [event(), event({ slug: "second", date: { mode: "exact", start: "2026-13-01" } })] }));
  });
});

describe("placeholder placement in the contract", () => {
  it("accepts a place on TBA and own-text dates, and rejects a bad one", () => {
    passes(DateInfo, { mode: "tba", place: "2027-02-10" });
    passes(DateInfo, { mode: "tba", place: null });
    passes(DateInfo, { mode: "text", text: "Early February", place: "2027-02-05" });
    fails(DateInfo, { mode: "tba", place: "2027-02-30" });
    fails(DateInfo, { mode: "tba", place: "soon" });
  });
  it("still reads the legacy month mode", () => passes(DateInfo, { mode: "month", month: "2027-02" }));
});
