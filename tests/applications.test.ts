import { describe, expect, it } from "vitest";
import {
  APP_STATUSES,
  CURRENT_INTAKE,
  countByStatus,
  filterQuery,
  matches,
  newApplicationMail,
  parseFilters,
  replyMailto,
  whatsappLink,
  type Application,
} from "@/lib/applications";
import { INBOXES } from "@/lib/inbox";

const a = (o: Partial<Application> = {}): Application => ({
  id: 1,
  created_at: "2026-11-02T10:00:00Z",
  intake: CURRENT_INTAKE,
  name: "Ada Lovelace",
  reg_no: "25BCE1234",
  email: "ada.lovelace2025@vitstudent.ac.in",
  phone: "98765 43210",
  department: "B.Tech CSE",
  year: "2nd",
  team: "Agentic AI",
  build: "An agent",
  why: "Because",
  task: "An answer",
  status: "new",
  notes: null,
  ...o,
});

describe("statuses", () => {
  it("the inbox, the status action and the CSV use the same steps", () => {
    expect([...INBOXES.applications.statuses]).toEqual([...APP_STATUSES]);
  });
});

describe("parseFilters", () => {
  it("defaults to everyone in the current intake", () => {
    expect(parseFilters({})).toEqual({ status: "all", team: "all", intake: CURRENT_INTAKE, q: "" });
  });
  it("ignores unknown values", () => {
    expect(parseFilters({ status: "hired", team: "Marketing", intake: "x; drop table" })).toEqual({ status: "all", team: "all", intake: CURRENT_INTAKE, q: "" });
  });
  it("keeps known values and trims the search", () => {
    expect(parseFilters({ status: "shortlisted", team: "Finance", intake: "all", q: "  ada " })).toEqual({ status: "shortlisted", team: "Finance", intake: "all", q: "ada" });
  });
});

describe("matches and counts", () => {
  const rows = [a(), a({ id: 2, status: "accepted", team: "Finance" }), a({ id: 3, intake: "pre-launch" }), a({ id: 4, name: "Grace Hopper", reg_no: "24MIS0001" })];
  it("filters by intake, team, status and search", () => {
    const f = parseFilters({});
    expect(rows.filter((r) => matches(r, f)).map((r) => r.id)).toEqual([1, 2, 4]);
    expect(rows.filter((r) => matches(r, { ...f, team: "Finance" })).map((r) => r.id)).toEqual([2]);
    expect(rows.filter((r) => matches(r, { ...f, q: "24mis" })).map((r) => r.id)).toEqual([4]);
    expect(rows.filter((r) => matches(r, { ...f, intake: "all" })).length).toBe(4);
  });
  it("counts each step within the other filters", () => {
    const c = countByStatus(rows, parseFilters({ status: "accepted" }));
    expect(c).toMatchObject({ all: 3, new: 2, accepted: 1, shortlisted: 0 });
  });
  it("builds short links back to a filter", () => {
    const f = parseFilters({});
    expect(filterQuery(f)).toBe("");
    expect(filterQuery(f, { status: "accepted", q: "a b" })).toBe("?status=accepted&q=a+b");
    expect(filterQuery(f, { intake: "all" })).toBe("?intake=all");
  });
});

describe("whatsappLink", () => {
  it("handles the ways people type Indian numbers", () => {
    expect(whatsappLink("98765 43210")).toBe("https://wa.me/919876543210");
    expect(whatsappLink("+91-98765-43210")).toBe("https://wa.me/919876543210");
    expect(whatsappLink("098765 43210")).toBe("https://wa.me/919876543210");
    expect(whatsappLink("12345")).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });
});

describe("replyMailto", () => {
  it("addresses the applicant, copies the club and greets them by first name", () => {
    const m = replyMailto("shortlisted", a());
    expect(m.startsWith("mailto:ada.lovelace2025%40vitstudent.ac.in?")).toBe(true);
    const q = new URLSearchParams(m.split("?")[1]);
    expect(q.get("cc")).toBe("contact@thefableclub.com");
    expect(q.get("body")).toMatch(/^Hi Ada,/);
    expect(m).not.toContain("+");
  });
});

describe("newApplicationMail", () => {
  it("names the applicant and team, lists the answers and links to the CMS search", () => {
    const m = newApplicationMail(a({ team: "Agentic AI", phone: "98765 43210", build: "A timetable bot", task: "Summarise notes" }));
    expect(m.subject).toBe("New application: Ada Lovelace (Agentic AI)");
    expect(m.text).toContain("Reg. no.: 25BCE1234");
    expect(m.text).toContain("Phone: 98765 43210");
    expect(m.text).toContain("Short task: Summarise notes");
    expect(m.text).toContain("https://cms.thefableclub.com/applications?q=25BCE1234");
    expect(m.text).not.toMatch(/\n{3,}/);
  });

  it("leaves out answers that are empty", () => {
    const m = newApplicationMail(a({ team: null, phone: null, build: null, task: null }));
    expect(m.subject).toBe("New application: Ada Lovelace");
    expect(m.text).not.toContain("Phone:");
    expect(m.text).not.toContain("Short task");
    expect(m.text).not.toMatch(/\n{3,}/);
  });
});
