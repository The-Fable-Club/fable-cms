import { describe, expect, it } from "vitest";
import { parseEventForm, parseMemberForm, slugify } from "@/lib/forms";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const event = (o: Record<string, string> = {}) =>
  fd({
    title: "Prompt Workshop", kind: "Workshop", phase: "1", date_mode: "exact", start_date: "2026-11-20", end_date: "",
    time_mode: "text", time_text: "4 pm", venue_mode: "text", venue: "Lab 2", seats_mode: "open", apply_mode: "form",
    summary: "A session.", description: "One.\r\n\r\nTwo.", highlights: "a\n\n b ", art: "pointer", ...o,
  });

describe("slugify", () => {
  it("makes safe slugs", () => {
    expect(slugify("Claude Code 101: Getting Started!")).toBe("claude-code-101-getting-started");
    expect(slugify("  Café  Night ")).toBe("cafe-night");
    expect(slugify("***")).toBe("");
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});

describe("parseEventForm", () => {
  it("parses a normal event and derives the slug", () => {
    const r = parseEventForm(event());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({ slug: "prompt-workshop", phase: 1, date_mode: "exact", start_date: "2026-11-20", end_date: null, status_override: null, apply_mode: "form" });
    expect(r.row.highlights).toEqual(["a", "b"]);
    expect(r.row.description).toBe("One.\n\nTwo.");
  });
  it("clears fields that do not belong to the chosen mode", () => {
    const r = parseEventForm(event({ date_mode: "tba", date_place_tba: "2027-02-10", start_date: "2026-11-20", date_text: "junk", end_date: "2026-12-01", time_mode: "tba", time_text: "junk", venue_mode: "tba", venue: "junk", seats_mode: "open", seats: "junk", apply_mode: "soon", apply_url: "https://x.example" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // the exact start date typed earlier is ignored; only the placeholder place is kept
    expect(r.row).toMatchObject({ start_date: "2027-02-10", end_date: null, date_text: null, date_month: null, time_text: "", venue: "", seats: null, apply_url: null });
  });
  it("keeps a typed date with an optional placeholder place", () => {
    const r = parseEventForm(event({ date_mode: "text", date_text: "Early February", date_place_text: "2027-02-05", date_place_tba: "1999-01-01" }));
    expect(r.ok && r.row).toMatchObject({ date_text: "Early February", start_date: "2027-02-05", date_month: null });
    const none = parseEventForm(event({ date_mode: "text", date_text: "After exams" }));
    expect(none.ok && none.row.start_date).toBeNull();
  });
  it("a TBA event may be placed on the timeline or left unplaced, and a bad place is rejected", () => {
    const placed = parseEventForm(event({ date_mode: "tba", date_place_tba: "2027-03-01" }));
    expect(placed.ok && placed.row).toMatchObject({ date_mode: "tba", start_date: "2027-03-01" });
    const unplaced = parseEventForm(event({ date_mode: "tba" }));
    expect(unplaced.ok && unplaced.row.start_date).toBeNull();
    const bad = parseEventForm(event({ date_mode: "tba", date_place_tba: "2027-02-30" }));
    expect(!bad.ok && bad.errors.date_place).toBeTruthy();
  });
  it("no longer accepts the month-only mode", () => {
    const r = parseEventForm(event({ date_mode: "month", date_month: "2027-02", start_date: "" }));
    expect(r.ok).toBe(false); // read as an exact date with no start
  });
  it("uses the venue box that belongs to the chosen mode", () => {
    const online = parseEventForm(event({ venue_mode: "online", venue: "stale text", venue_online: "Google Meet" }));
    expect(online.ok && online.row.venue).toBe("Google Meet");
    const empty = parseEventForm(event({ venue_mode: "online", venue: "stale text" }));
    expect(empty.ok && empty.row.venue).toBe("");
  });
  it("points each problem at its form field", () => {
    const bad = (o: Record<string, string>) => {
      const r = parseEventForm(event(o));
      return r.ok ? {} : r.errors;
    };
    expect(bad({ start_date: "2026-02-30" }).start_date).toBeTruthy();
    expect(bad({ start_date: "" }).start_date).toBeTruthy();
    expect(bad({ end_date: "2026-11-19" }).end_date).toMatch(/before/);
    expect(bad({ date_mode: "text", date_text: "" }).date_text).toBeTruthy();
    expect(bad({ time_text: "" }).time_text).toBeTruthy();
    expect(bad({ venue: "" }).venue).toBeTruthy();
    expect(bad({ seats_mode: "text", seats: "" }).seats).toBeTruthy();
    expect(bad({ apply_mode: "link", apply_url: "" }).apply_url).toBeTruthy();
    expect(bad({ apply_mode: "link", apply_url: "javascript:alert(1)" }).apply_url).toBeTruthy();
    expect(bad({ title: "" }).title).toBeTruthy();
    expect(bad({ slug: "Bad Slug" }).slug).toBeTruthy();
    expect(bad({ phase: "9" }).phase).toBeTruthy();
    expect(bad({ summary: "" }).summary).toBeTruthy();
  });
  it("accepts everything undecided at once", () => {
    const r = parseEventForm(event({ date_mode: "tba", time_mode: "tba", venue_mode: "tba", seats_mode: "tba", apply_mode: "none" }));
    expect(r.ok).toBe(true);
  });
  it("validates hub posts", () => {
    const post = { kind: "link", title: "Slides", href: "https://x.example/s", posted_at: "2026-10-17", posted_by: "haise-727" };
    expect(parseEventForm(event({ hub: JSON.stringify([post]) })).ok).toBe(true);
    const bad = parseEventForm(event({ hub: JSON.stringify([{ ...post, href: "javascript:x" }]) }));
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.errors.hub).toBeTruthy();
    const broken = parseEventForm(event({ hub: "{not json" }));
    expect(!broken.ok && broken.errors.hub).toMatch(/could not be read/);
  });
});

describe("parseMemberForm", () => {
  const member = (o: Record<string, string> = {}) => fd({ name: "Ada Lovelace", role: "", department: "CSE", year_mode: "pick", year: "2nd", bio: "Hi", focus: "AI, Design ,", art: "sprouts", ...o });
  it("parses, trims lists and derives the slug", () => {
    const r = parseMemberForm(member());
    expect(r.ok && r.row).toMatchObject({ slug: "ada-lovelace", group: "Member", focus: ["AI", "Design"], show_email: false });
  });
  it("year modes", () => {
    expect(parseMemberForm(member({ year_mode: "none", year: "x" })).ok && true).toBe(true);
    const none = parseMemberForm(member({ year_mode: "none", year: "x" }));
    expect(none.ok && none.row.year).toBe("");
    const bad = parseMemberForm(member({ year_mode: "text", year: "ignored", year_text: "" }));
    expect(!bad.ok && bad.errors.year_text).toBeTruthy();
    const typed = parseMemberForm(member({ year_mode: "text", year: "ignored", year_text: "Final year" }));
    expect(typed.ok && typed.row.year).toBe("Final year");
    const picked = parseMemberForm(member({ year_mode: "pick", year: "3rd", year_text: "ignored" }));
    expect(picked.ok && picked.row.year).toBe("3rd");
  });
  it("validates links and email", () => {
    const r = parseMemberForm(member({ linkedin: "linkedin.com/in/a" }));
    expect(!r.ok && r.errors.linkedin).toBeTruthy();
    const e = parseMemberForm(member({ email: "nope", show_email: "on" }));
    expect(!e.ok && e.errors.email).toBeTruthy();
    const hidden = parseMemberForm(member({ email: "nope" }));
    expect(!hidden.ok && hidden.errors.email).toBeTruthy();
  });
  it("takes the group from the form and falls back to Member", () => {
    for (const g of ["Faculty", "Board", "Leads", "Member"]) {
      const r = parseMemberForm(member({ group: g, role: "Chairperson" }));
      expect(r.ok && r.row.group).toBe(g);
    }
    const bad = parseMemberForm(member({ group: "Admin" }));
    expect(bad.ok && bad.row.group).toBe("Member");
  });
  it("requires a name", () => {
    const r = parseMemberForm(member({ name: "" }));
    expect(!r.ok && r.errors.name).toBeTruthy();
  });
});
