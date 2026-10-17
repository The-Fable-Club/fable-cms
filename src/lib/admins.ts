// Rules for managing who can use the CMS. The database enforces who may change the list
// (owners only); these checks keep an owner from locking everyone out by accident.
export type AdminRow = { github_username: string; role: "owner" | "editor" };

const GITHUB_USERNAME = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

export function parseNewAdmin(usernameInput: string, roleInput: string): { ok: true; username: string; role: "owner" | "editor" } | { ok: false; message: string } {
  const username = usernameInput.trim().replace(/^@/, "").toLowerCase();
  if (!GITHUB_USERNAME.test(username) || username.includes("--")) return { ok: false, message: "That is not a valid GitHub username." };
  if (roleInput !== "owner" && roleInput !== "editor") return { ok: false, message: "Choose a role." };
  return { ok: true, username, role: roleInput };
}

/** Can `actor` remove `target` from the list? Never yourself, never the last owner. */
export function canRemove(admins: AdminRow[], actor: string, target: string): { ok: true } | { ok: false; message: string } {
  const t = admins.find((a) => a.github_username === target);
  if (!t) return { ok: false, message: "That person is not in the list." };
  if (target === actor) return { ok: false, message: "You can't remove yourself. Ask another owner." };
  if (t.role === "owner" && admins.filter((a) => a.role === "owner").length <= 1) return { ok: false, message: "There must always be at least one owner." };
  return { ok: true };
}

/** Can `target`'s role change to `role`? The last owner can't be demoted. */
export function canChangeRole(admins: AdminRow[], target: string, role: "owner" | "editor"): { ok: true } | { ok: false; message: string } {
  const t = admins.find((a) => a.github_username === target);
  if (!t) return { ok: false, message: "That person is not in the list." };
  if (t.role === "owner" && role !== "owner" && admins.filter((a) => a.role === "owner").length <= 1) return { ok: false, message: "There must always be at least one owner." };
  return { ok: true };
}
