import { describe, expect, it } from "vitest";
import { buildSnapshot, mediaUrl, type EventRow, type MemberRow } from "@/lib/snapshot";

const URL = "https://proj.supabase.co";
const now = new Date("2026-10-17T10:00:00Z");

const ev = (o: Partial<EventRow> = {}): EventRow => ({
  id: 1, slug: "prompt-workshop", title: "Prompt Workshop", kind: "Workshop", phase: 1, status_override: null,
  date_mode: "exact", start_date: "2026-11-20", end_date: null, date_month: null, date_text: null,
  time_mode: "text", time_text: "4 – 6 pm", venue_mode: "text", venue: "Lab 2", seats_mode: "open", seats: null,
  apply_mode: "form", apply_url: null, summary: "A session.", description: "One.\n\nTwo.", highlights: ["a", " "],
  art: "pointer", photo_path: null, hub: [], archived: false, ...o,
});
const mem = (o: Partial<MemberRow> = {}): MemberRow => ({
  id: 1, slug: "ada-l", name: "Ada L", role: "", group: "Member", position: 0, department: "CSE",
  year_mode: "pick", year: "2nd", bio: "", focus: [], email: "ada@x.co", show_email: false,
  linkedin: null, github: null, art: "sprouts", photo_path: null, archived: false, ...o,
});
const build = (events: EventRow[], members: MemberRow[] = []) => buildSnapshot({ events, members }, { supabaseUrl: URL, now });

describe("buildSnapshot", () => {
  it("builds a valid snapshot and splits description into paragraphs", () => {
    const r = build([ev()], [mem()]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.schema_version).toBe(1);
    expect(r.snapshot.generated_at).toBe(now.toISOString());
    expect(r.snapshot.events[0].description).toEqual(["One.", "Two."]);
    expect(r.snapshot.events[0].highlights).toEqual(["a"]);
  });

  it("skips archived rows and keeps every group, in order", () => {
    const r = build([ev(), ev({ id: 2, slug: "old", archived: true })], [
      mem({ id: 1, slug: "m", position: 50 }),
      mem({ id: 2, slug: "b", group: "Board", position: 10 }),
      mem({ id: 3, slug: "c", archived: true }),
      mem({ id: 4, slug: "f", group: "Faculty", position: 1 }),
    ]);
    expect(r.ok && r.snapshot.events.map((e) => e.slug)).toEqual(["prompt-workshop"]);
    expect(r.ok && r.snapshot.members.map((m) => [m.slug, m.group, m.order])).toEqual([["f", "Faculty", 1], ["b", "Board", 10], ["m", "Member", 50]]);
  });

  it("defaults an empty role to Member", () => {
    const r = build([], [mem()]);
    expect(r.ok && r.snapshot.members[0].role).toBe("Member");
  });

  it("hides the email unless show_email is on", () => {
    const hidden = build([], [mem()]);
    const shown = build([], [mem({ show_email: true })]);
    expect(hidden.ok && hidden.snapshot.members[0].links.email).toBeNull();
    expect(shown.ok && shown.snapshot.members[0].links.email).toBe("ada@x.co");
  });

  it("maps every placeholder mode", () => {
    const r = build([
      ev({ slug: "a", date_mode: "month", date_month: "2027-02", time_mode: "tba", venue_mode: "online", venue: "", seats_mode: "tba", apply_mode: "soon" }),
      ev({ slug: "b", date_mode: "text", date_text: "Early March", date_month: "2027-03", apply_mode: "link", apply_url: "https://f.example/x", seats_mode: "text", seats: "40" }),
      ev({ slug: "c", date_mode: "tba", start_date: null, venue_mode: "tba", apply_mode: "none" }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const by = Object.fromEntries(r.snapshot.events.map((e) => [e.slug, e]));
    expect(by.a.date).toEqual({ mode: "month", month: "2027-02" });
    expect(by.a.venue.mode).toBe("online");
    expect(by.b.date).toEqual({ mode: "text", text: "Early March", month: "2027-03" });
    expect(by.b.apply).toEqual({ mode: "link", url: "https://f.example/x" });
    expect(by.c.date.mode).toBe("tba");
  });

  it("sorts by date with undated events last", () => {
    const r = build([
      ev({ slug: "tba", date_mode: "tba", start_date: null }),
      ev({ slug: "late", start_date: "2027-01-10" }),
      ev({ slug: "mid", date_mode: "month", date_month: "2026-12", start_date: null }),
      ev({ slug: "early", start_date: "2026-11-01" }),
    ]);
    expect(r.ok && r.snapshot.events.map((e) => e.slug)).toEqual(["early", "mid", "late", "tba"]);
  });

  it("sorts hub posts newest first and drops blank bodies", () => {
    const hub = [
      { kind: "announcement", title: "Old", body: " ", href: "", posted_at: "2026-10-01", posted_by: "x" },
      { kind: "link", title: "New", href: "https://s.example/a", posted_at: "2026-10-10", posted_by: "x" },
    ];
    const r = build([ev({ hub })]);
    expect(r.ok && r.snapshot.events[0].hub.map((h) => h.title)).toEqual(["New", "Old"]);
    expect(r.ok && r.snapshot.events[0].hub[1].body).toBeNull();
  });

  it("builds public media URLs", () => {
    const r = build([ev({ photo_path: "events/a.webp" })]);
    expect(r.ok && r.snapshot.events[0].photo).toBe(`${URL}/storage/v1/object/public/media/events/a.webp`);
    expect(mediaUrl(`${URL}/`, "/x.webp")).toBe(`${URL}/storage/v1/object/public/media/x.webp`);
    expect(mediaUrl(URL, "  ")).toBeNull();
  });

  it("names the event and field for each problem and builds nothing", () => {
    const r = build([ev({ title: "Broken", date_mode: "exact", start_date: "2026-02-30" }), ev({ id: 2, slug: "Bad Slug", title: "Other" })]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.some((p) => p.label === "Broken" && p.field === "date.start")).toBe(true);
    expect(r.problems.some((p) => p.label === "Other" && p.field === "slug")).toBe(true);
  });

  it("rejects a bad member and duplicate slugs", () => {
    const bad = build([], [mem({ name: "Zed", linkedin: "linkedin.com/in/z" })]);
    expect(!bad.ok && bad.problems[0]).toMatchObject({ entity: "member", label: "Zed", field: "links.linkedin" });
    const dup = build([ev(), ev({ id: 2 })]);
    expect(!dup.ok && dup.problems[0]).toMatchObject({ entity: "release", field: "events.1.slug" });
  });

  it("builds an empty snapshot", () => {
    const r = build([]);
    expect(r.ok && r.snapshot.events).toEqual([]);
  });
});
