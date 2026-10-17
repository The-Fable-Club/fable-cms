import { describe, expect, it } from "vitest";
import { MIN_ROLE, RANK, ROLES, can, canSaveEvent, navFor, roleFromRank, type Action, type Role } from "@/lib/roles";

describe("role levels", () => {
  it("are ordered member < creator < admin < owner", () => {
    expect(ROLES.map((r) => RANK[r])).toEqual([1, 2, 3, 4]);
  });
  it("map back from the database rank, and unknown ranks are nobody", () => {
    expect(roleFromRank(3)).toBe("admin");
    expect(roleFromRank(0)).toBeNull();
    expect(roleFromRank(null)).toBeNull();
    expect(roleFromRank(9)).toBeNull();
  });
});

describe("permissions", () => {
  const actions = Object.keys(MIN_ROLE) as Action[];

  it("a higher role can do everything a lower role can", () => {
    for (let i = 1; i < ROLES.length; i++) for (const a of actions) if (can(ROLES[i - 1], a)) expect(can(ROLES[i], a), `${ROLES[i]} / ${a}`).toBe(true);
  });
  it("nobody (no role) can do anything", () => {
    for (const a of actions) {
      expect(can(null, a)).toBe(false);
      expect(can(undefined, a)).toBe(false);
    }
  });
  it("matches the agreed matrix exactly", () => {
    const table: Record<Role, Action[]> = {
      member: ["read_signups"],
      creator: ["read_signups", "edit_draft_events", "upload_media"],
      admin: ["read_signups", "edit_draft_events", "upload_media", "edit_live_events", "manage_members", "triage_signups", "publish", "view_releases"],
      owner: actions,
    };
    for (const r of ROLES) expect(actions.filter((a) => can(r, a)).sort(), r).toEqual([...table[r]].sort());
  });
  it("only owners manage people and roll back; members and creators cannot publish", () => {
    expect(can("admin", "manage_people")).toBe(false);
    expect(can("admin", "rollback")).toBe(false);
    expect(can("owner", "manage_people")).toBe(true);
    expect(can("creator", "publish")).toBe(false);
    expect(can("member", "publish")).toBe(false);
    expect(can("member", "manage_members")).toBe(false);
    expect(can("creator", "manage_members")).toBe(false);
  });
});

describe("canSaveEvent", () => {
  it("admins and owners may save anything", () => {
    for (const r of ["admin", "owner"] as const) {
      expect(canSaveEvent(r, { existingDraft: false, newDraft: false }).ok).toBe(true);
      expect(canSaveEvent(r, { existingDraft: null, newDraft: false }).ok).toBe(true);
    }
  });
  it("creators may create drafts and edit drafts", () => {
    expect(canSaveEvent("creator", { existingDraft: null, newDraft: true }).ok).toBe(true);
    expect(canSaveEvent("creator", { existingDraft: true, newDraft: true }).ok).toBe(true);
  });
  it("creators may not touch live events or take anything live", () => {
    expect(canSaveEvent("creator", { existingDraft: false, newDraft: true }).ok).toBe(false);
    expect(canSaveEvent("creator", { existingDraft: true, newDraft: false }).ok).toBe(false);
    expect(canSaveEvent("creator", { existingDraft: null, newDraft: false }).ok).toBe(false);
  });
  it("members may not edit events at all", () => {
    expect(canSaveEvent("member", { existingDraft: true, newDraft: true }).ok).toBe(false);
  });
});

describe("navigation", () => {
  const links = (r: Role) => navFor(r).map((n) => n.label);
  it("shows each role only what it can use", () => {
    expect(links("member")).toEqual(["Dashboard", "Applications", "Registrations"]);
    expect(links("creator")).toEqual(["Dashboard", "Events", "Applications", "Registrations"]);
    expect(links("admin")).toEqual(["Dashboard", "Events", "Members", "Applications", "Registrations", "Releases"]);
    expect(links("owner")).toEqual(["Dashboard", "Events", "Members", "Applications", "Registrations", "Releases", "People"]);
  });
});
