// Date and status rules shared by the CMS and the public site (copied verbatim
// into the site repo as src/lib/event-logic.ts). Pure functions, no I/O, so the
// same inputs always give the same answer and can be tested with a fixed "today".
import type { ApplyInfo, DateInfo } from "./contract";

export type EventStatus = "active" | "upcoming" | "past";
export type RegistrationState = "open" | "soon" | "closed" | "none";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = MONTHS.map((m) => m.slice(0, 3));

export const monthStart = (month: string) => `${month}-01`;
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this one
  return `${month}-${String(last).padStart(2, "0")}`;
}
export const monthLabel = (month: string, long = true) => {
  const [y, m] = month.split("-").map(Number);
  return `${(long ? MONTHS : MON)[m - 1]} ${y}`;
};
const day = (iso: string) => Number(iso.slice(8, 10));

/** The stretch of calendar an event covers, if we know one. `tentative` = only a month is known. */
export function eventWindow(date: DateInfo): { start: string; end: string | null; tentative: boolean } | null {
  switch (date.mode) {
    case "exact":
      return { start: date.start, end: date.end ?? null, tentative: false };
    case "month":
      return { start: monthStart(date.month), end: monthEnd(date.month), tentative: true };
    case "text":
      if (date.place) return { start: date.place, end: null, tentative: true };
      return date.month ? { start: monthStart(date.month), end: monthEnd(date.month), tentative: true } : null;
    case "tba":
      return date.place ? { start: date.place, end: null, tentative: true } : null;
  }
}

/**
 * Live / upcoming / past, from the dates alone unless a person overrides it.
 * Only an exact date can be "active": a tentative month is never "happening now".
 */
export function deriveStatus(date: DateInfo, today: string, override: EventStatus | null): EventStatus {
  if (override) return override;
  if (date.mode === "exact") {
    const last = date.end ?? date.start;
    if (last < today) return "past";
    if (date.start <= today) return "active";
    return "upcoming";
  }
  const w = eventWindow(date);
  if (w && (w.end ?? w.start) < today) return "past";
  return "upcoming";
}

/** Human date text for the page. */
export function dateLabel(date: DateInfo): string {
  switch (date.mode) {
    case "exact": {
      const [y, m] = [date.start.slice(0, 4), Number(date.start.slice(5, 7))];
      if (!date.end || date.end === date.start) return `${day(date.start)} ${MON[m - 1]} ${y}`;
      const [ey, em] = [date.end.slice(0, 4), Number(date.end.slice(5, 7))];
      const a = `${day(date.start)} ${MON[m - 1]}${ey !== y ? ` ${y}` : ""}`;
      return `${a} – ${day(date.end)} ${MON[em - 1]} ${ey}`;
    }
    case "month":
      return monthLabel(date.month);
    case "text":
      return date.text;
    case "tba":
      return "Date to be announced";
  }
}

/** What the register / apply control should do right now. */
export function registrationState(apply: ApplyInfo, status: EventStatus): RegistrationState {
  if (apply.mode === "none") return "none";
  if (apply.mode === "closed" || status === "past") return "closed";
  if (apply.mode === "soon") return "soon";
  return "open"; // form or link
}
