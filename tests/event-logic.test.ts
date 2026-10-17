import { describe, expect, it } from "vitest";
import type { DateInfo } from "@/lib/contract";
import { dateLabel, deriveStatus, eventWindow, monthEnd, monthLabel, registrationState } from "@/lib/event-logic";

const exact = (start: string, end?: string): DateInfo => ({ mode: "exact", start, end: end ?? null });

describe("month helpers", () => {
  it("finds the last day of every kind of month", () => {
    expect(monthEnd("2026-01")).toBe("2026-01-31");
    expect(monthEnd("2026-04")).toBe("2026-04-30");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29"); // leap year
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });
  it("labels months", () => {
    expect(monthLabel("2027-02")).toBe("February 2027");
    expect(monthLabel("2027-02", false)).toBe("Feb 2027");
  });
});

describe("eventWindow", () => {
  it("exact dates are not tentative", () => {
    expect(eventWindow(exact("2026-11-20"))).toEqual({ start: "2026-11-20", end: null, tentative: false });
    expect(eventWindow(exact("2027-01-23", "2027-01-24"))).toEqual({ start: "2027-01-23", end: "2027-01-24", tentative: false });
  });
  it("a month covers the whole month and is tentative", () => {
    expect(eventWindow({ mode: "month", month: "2027-02" })).toEqual({ start: "2027-02-01", end: "2027-02-28", tentative: true });
  });
  it("own text is placed on the timeline only if it names a month", () => {
    expect(eventWindow({ mode: "text", text: "Early February", month: "2027-02" })?.tentative).toBe(true);
    expect(eventWindow({ mode: "text", text: "After exams" })).toBeNull();
    expect(eventWindow({ mode: "text", text: "After exams", month: null })).toBeNull();
  });
  it("to be announced has no window", () => {
    expect(eventWindow({ mode: "tba" })).toBeNull();
  });
});

describe("deriveStatus (fixed 'today' = 2026-10-17)", () => {
  const today = "2026-10-17";
  it("exact: past, active (including first and last day) and upcoming", () => {
    expect(deriveStatus(exact("2026-10-09"), today, null)).toBe("past");
    expect(deriveStatus(exact("2026-10-16"), today, null)).toBe("past"); // yesterday, one-day event
    expect(deriveStatus(exact("2026-10-17"), today, null)).toBe("active"); // today, one-day event
    expect(deriveStatus(exact("2026-10-14", "2026-11-06"), today, null)).toBe("active");
    expect(deriveStatus(exact("2026-10-10", "2026-10-17"), today, null)).toBe("active"); // last day still active
    expect(deriveStatus(exact("2026-10-10", "2026-10-16"), today, null)).toBe("past"); // ended yesterday
    expect(deriveStatus(exact("2026-10-18"), today, null)).toBe("upcoming"); // tomorrow
  });
  it("a tentative month is never 'active'", () => {
    expect(deriveStatus({ mode: "month", month: "2026-10" }, today, null)).toBe("upcoming"); // this month, day unknown
    expect(deriveStatus({ mode: "month", month: "2026-11" }, today, null)).toBe("upcoming");
  });
  it("a tentative month flips to past only after the month has ended", () => {
    expect(deriveStatus({ mode: "month", month: "2026-10" }, "2026-10-31", null)).toBe("upcoming");
    expect(deriveStatus({ mode: "month", month: "2026-10" }, "2026-11-01", null)).toBe("past");
    expect(deriveStatus({ mode: "text", text: "Late Sept", month: "2026-09" }, today, null)).toBe("past");
  });
  it("text without a month and TBA stay upcoming", () => {
    expect(deriveStatus({ mode: "text", text: "After exams" }, today, null)).toBe("upcoming");
    expect(deriveStatus({ mode: "tba" }, "2099-01-01", null)).toBe("upcoming");
  });
  it("an override always wins", () => {
    expect(deriveStatus(exact("2020-01-01"), today, "upcoming")).toBe("upcoming");
    expect(deriveStatus({ mode: "tba" }, today, "past")).toBe("past");
    expect(deriveStatus(exact("2030-01-01"), today, "active")).toBe("active");
  });
  it("handles year boundaries", () => {
    expect(deriveStatus(exact("2026-12-30", "2027-01-02"), "2027-01-01", null)).toBe("active");
    expect(deriveStatus(exact("2026-12-30", "2027-01-02"), "2027-01-03", null)).toBe("past");
  });
});

describe("dateLabel", () => {
  it("formats exact dates", () => {
    expect(dateLabel(exact("2026-11-20"))).toBe("20 Nov 2026");
    expect(dateLabel(exact("2027-01-23", "2027-01-24"))).toBe("23 Jan – 24 Jan 2027");
    expect(dateLabel(exact("2026-12-30", "2027-01-02"))).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(dateLabel(exact("2026-11-20", "2026-11-20"))).toBe("20 Nov 2026"); // same-day end collapses
  });
  it("formats the placeholder modes", () => {
    expect(dateLabel({ mode: "month", month: "2027-02" })).toBe("February 2027");
    expect(dateLabel({ mode: "text", text: "Early February" })).toBe("Early February");
    expect(dateLabel({ mode: "tba" })).toBe("Date to be announced");
  });
});

describe("registrationState", () => {
  it("open for a form or a link while the event is not over", () => {
    expect(registrationState({ mode: "form" }, "upcoming")).toBe("open");
    expect(registrationState({ mode: "form" }, "active")).toBe("open");
    expect(registrationState({ mode: "link", url: "https://x.example" }, "upcoming")).toBe("open");
  });
  it("closes once the event is past", () => {
    expect(registrationState({ mode: "form" }, "past")).toBe("closed");
    expect(registrationState({ mode: "link", url: "https://x.example" }, "past")).toBe("closed");
    expect(registrationState({ mode: "soon" }, "past")).toBe("closed");
  });
  it("soon, closed and none are respected", () => {
    expect(registrationState({ mode: "soon" }, "upcoming")).toBe("soon");
    expect(registrationState({ mode: "closed" }, "upcoming")).toBe("closed");
    expect(registrationState({ mode: "none" }, "upcoming")).toBe("none");
    expect(registrationState({ mode: "none" }, "past")).toBe("none");
  });
});

describe("placeholder placement (TBA / own text with a hidden place)", () => {
  const tbaAt = { mode: "tba", place: "2027-02-10" } as const;
  it("a placed TBA is positioned but still reads as to be announced", () => {
    expect(eventWindow(tbaAt)).toEqual({ start: "2027-02-10", end: null, tentative: true });
    expect(dateLabel(tbaAt)).toBe("Date to be announced");
    expect(eventWindow({ mode: "tba" })).toBeNull();
    expect(eventWindow({ mode: "tba", place: null })).toBeNull();
  });
  it("own text with a place keeps its text and is positioned by the place, not the legacy month", () => {
    const d = { mode: "text", text: "Early February", place: "2027-02-05", month: "2027-03" } as const;
    expect(eventWindow(d)).toEqual({ start: "2027-02-05", end: null, tentative: true });
    expect(dateLabel(d)).toBe("Early February");
  });
  it("a placed event is upcoming until its place has passed, and never live", () => {
    expect(deriveStatus(tbaAt, "2027-02-10", null)).toBe("upcoming");
    expect(deriveStatus(tbaAt, "2027-02-11", null)).toBe("past");
    expect(deriveStatus(tbaAt, "2026-10-17", null)).toBe("upcoming");
    expect(deriveStatus(tbaAt, "2027-02-11", "upcoming")).toBe("upcoming");
  });
});
