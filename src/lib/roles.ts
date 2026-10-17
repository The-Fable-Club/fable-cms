// Who can do what in the CMS. Four levels; each includes everything below it.
// The DATABASE enforces the same rules with row level security (migration 0006); this file drives
// what the app shows and refuses early, and is kept in step with the policies by tests.

export const ROLES = ["member", "creator", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const RANK: Record<Role, number> = { member: 1, creator: 2, admin: 3, owner: 4 };

export const ROLE_INFO: Record<Role, { label: string; summary: string }> = {
  member: { label: "Member", summary: "Can read applications and registrations. Cannot change or publish anything." },
  creator: { label: "Creator", summary: "Can also create events and save them as drafts. Cannot edit members, change live events or publish." },
  admin: { label: "Admin", summary: "Can also manage everything on the site (events, members, sign-ups) and publish. Cannot manage people." },
  owner: { label: "Owner", summary: "Everything, including adding, removing and re-leveling people, and rolling back releases." },
};

export function roleFromRank(rank: number | null | undefined): Role | null {
  return ROLES.find((r) => RANK[r] === rank) ?? null;
}

/** The lowest role allowed to do each thing. */
export const MIN_ROLE = {
  read_signups: "member", // applications and registrations: view and download
  edit_draft_events: "creator", // create events, edit events that are still drafts
  upload_media: "creator",
  edit_live_events: "admin", // change or delete an event that is not a draft, and take a draft live
  manage_members: "admin", // the people shown on the site
  triage_signups: "admin", // change status and notes on applications and registrations
  publish: "admin",
  view_releases: "admin",
  rollback: "owner", // retry a rebuild, publish an old release again
  manage_people: "owner", // who can sign in, and at what level
} as const satisfies Record<string, Role>;

export type Action = keyof typeof MIN_ROLE;

export const can = (role: Role | null | undefined, action: Action) => !!role && RANK[role] >= RANK[MIN_ROLE[action]];

/** Can this role save changes to an event, given whether it is (or will be) a draft? */
export function canSaveEvent(role: Role, opts: { existingDraft: boolean | null; newDraft: boolean }): { ok: true } | { ok: false; message: string } {
  if (can(role, "edit_live_events")) return { ok: true };
  if (!can(role, "edit_draft_events")) return { ok: false, message: "You don't have permission to edit events." };
  if (opts.existingDraft === false) return { ok: false, message: "Only admins can change an event that is already live. Ask an admin." };
  if (!opts.newDraft) return { ok: false, message: "Only admins can take an event live. Keep it as a draft." };
  return { ok: true };
}

/** The pages in the navigation for a role. */
export const NAV: { href: string; label: string; action: Action }[] = [
  { href: "/", label: "Dashboard", action: "read_signups" },
  { href: "/events", label: "Events", action: "edit_draft_events" },
  { href: "/members", label: "Members", action: "manage_members" },
  { href: "/applications", label: "Applications", action: "read_signups" },
  { href: "/registrations", label: "Registrations", action: "read_signups" },
  { href: "/releases", label: "Releases", action: "view_releases" },
  { href: "/admins", label: "People", action: "manage_people" },
];
export const navFor = (role: Role) => NAV.filter((n) => can(role, n.action));
