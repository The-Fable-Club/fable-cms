// Rules for managing who can use the CMS. The database enforces who may change the list
// (owners only); these checks keep an owner from locking everyone out by accident.
import { ROLES, type Role } from "@/lib/roles";

export type AdminRow = { github_username: string; role: Role };

const GITHUB_USERNAME = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

export function parseNewAdmin(usernameInput: string, roleInput: string): { ok: true; username: string; role: Role } | { ok: false; message: string } {
  const username = usernameInput.trim().replace(/^@/, "").toLowerCase();
  if (!GITHUB_USERNAME.test(username) || username.includes("--")) return { ok: false, message: "That is not a valid GitHub username." };
  const role = ROLES.find((r) => r === roleInput);
  if (!role) return { ok: false, message: "Choose a level." };
  return { ok: true, username, role };
}

/** Can `actor` remove `target` from the list? Never yourself, never the last owner. */
export function canRemove(admins: AdminRow[], actor: string, target: string): { ok: true } | { ok: false; message: string } {
  const t = admins.find((a) => a.github_username === target);
  if (!t) return { ok: false, message: "That person is not in the list." };
  if (target === actor) return { ok: false, message: "You can't remove yourself. Ask another owner." };
  if (t.role === "owner" && admins.filter((a) => a.role === "owner").length <= 1) return { ok: false, message: "There must always be at least one owner." };
  return { ok: true };
}

/** Can `actor` change `target`'s role to `role`? Nobody changes their own level (so an owner can't demote or lock themselves out), and the last owner can't be demoted. */
export function canChangeRole(admins: AdminRow[], actor: string, target: string, role: Role): { ok: true } | { ok: false; message: string } {
  if (target === actor) return { ok: false, message: "You can't change your own access level. Ask another owner." };
  const t = admins.find((a) => a.github_username === target);
  if (!t) return { ok: false, message: "That person is not in the list." };
  if (t.role === "owner" && role !== "owner" && admins.filter((a) => a.role === "owner").length <= 1) return { ok: false, message: "There must always be at least one owner." };
  return { ok: true };
}
