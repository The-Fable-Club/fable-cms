import { describe, expect, it } from "vitest";
import { canChangeRole, canRemove, parseNewAdmin, type AdminRow } from "@/lib/admins";

const list: AdminRow[] = [
  { github_username: "haise-727", role: "owner" },
  { github_username: "sharann-del", role: "owner" },
  { github_username: "ada", role: "admin" },
];

describe("parseNewAdmin", () => {
  it("accepts all four levels", () => {
    for (const r of ["member", "creator", "admin", "owner"]) expect(parseNewAdmin("ada", r)).toMatchObject({ ok: true, role: r });
  });
  it("normalises case, spaces and a leading @", () => {
    expect(parseNewAdmin("  @Sharann-Del ", "admin")).toEqual({ ok: true, username: "sharann-del", role: "admin" });
  });
  it("rejects invalid usernames and roles", () => {
    for (const bad of ["", "-a", "a-", "a--b", "has space", "a/b", "x".repeat(40), "<script>"]) expect(parseNewAdmin(bad, "admin").ok).toBe(false);
    expect(parseNewAdmin("ada", "editor").ok).toBe(false); // the old name is gone
    expect(parseNewAdmin("ada", "superuser").ok).toBe(false);
    expect(parseNewAdmin("ada", "").ok).toBe(false);
  });
});

describe("canRemove", () => {
  it("lets an owner remove an editor or another owner", () => {
    expect(canRemove(list, "haise-727", "ada").ok).toBe(true);
    expect(canRemove(list, "haise-727", "sharann-del").ok).toBe(true);
  });
  it("never removes yourself or the last owner", () => {
    expect(canRemove(list, "haise-727", "haise-727").ok).toBe(false);
    const one: AdminRow[] = [{ github_username: "a", role: "owner" }, { github_username: "b", role: "admin" }];
    expect(canRemove(one, "b", "a").ok).toBe(false);
  });
  it("reports a missing person", () => expect(canRemove(list, "haise-727", "nobody").ok).toBe(false));
});

describe("canChangeRole", () => {
  it("allows promoting and demoting other people when another owner remains", () => {
    expect(canChangeRole(list, "haise-727", "ada", "owner").ok).toBe(true);
    expect(canChangeRole(list, "haise-727", "sharann-del", "admin").ok).toBe(true);
  });
  it("nobody changes their own level, not even an owner", () => {
    expect(canChangeRole(list, "haise-727", "haise-727", "admin").ok).toBe(false);
    expect(canChangeRole(list, "haise-727", "haise-727", "owner").ok).toBe(false);
    expect(canChangeRole(list, "ada", "ada", "owner").ok).toBe(false);
  });
  it("refuses to demote the last owner", () => {
    const one: AdminRow[] = [{ github_username: "a", role: "owner" }, { github_username: "b", role: "admin" }];
    expect(canChangeRole(one, "b", "a", "admin").ok).toBe(false);
  });
  it("reports a missing person", () => expect(canChangeRole(list, "haise-727", "nobody", "admin").ok).toBe(false));
});
