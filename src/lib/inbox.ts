import { APP_STATUSES } from "@/lib/applications";

// The two live sign-up lists, described once so the screens, the status action and the CSV export agree.
export const INBOXES = {
  applications: {
    title: "Applications",
    intro: "People who applied to join the club from the Join page.",
    statuses: APP_STATUSES, // the review steps: src/lib/applications.ts
    columns: ["created_at", "intake", "name", "reg_no", "email", "phone", "department", "year", "team", "build", "why", "task", "status", "notes"],
  },
  registrations: {
    title: "Registrations",
    intro: "People who registered for an event with the on-site form.",
    statuses: ["new", "confirmed", "waitlist", "cancelled"],
    columns: ["created_at", "event_slug", "name", "reg_no", "email", "department", "year", "phone", "status", "notes"],
  },
} as const;

export type InboxTable = keyof typeof INBOXES;
export const isInbox = (t: string): t is InboxTable => t in INBOXES;
export const isStatus = (t: InboxTable, s: string) => (INBOXES[t].statuses as readonly string[]).includes(s);
