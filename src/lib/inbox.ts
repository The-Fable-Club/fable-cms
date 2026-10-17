// The two live sign-up lists, described once so the screens, the status action and the CSV export agree.
export const INBOXES = {
  applications: {
    title: "Applications",
    intro: "People who applied to join the club from the Join page.",
    statuses: ["new", "reviewed", "accepted", "rejected"],
    columns: ["created_at", "name", "reg_no", "email", "department", "year", "level", "tracks", "why", "status", "notes"],
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
