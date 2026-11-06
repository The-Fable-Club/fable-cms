import { describe, expect, it } from "vitest";
import { MIN_ROLE, RANK, ROLES, can, canDeleteEvent, canSaveEvent, navFor, roleFromRank, type Action, type Role } from "@/lib/roles";

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
      member: ["read_signups", "read_questions"],
      creator: ["read_signups", "read_questions", "edit_draft_events", "upload_media", "answer_questions"],
      admin: ["read_signups", "read_questions", "edit_draft_events", "upload_media", "answer_questions", "edit_live_events", "manage_members", "triage_signups", "moderate_questions", "publish", "view_releases", "clean_media"],
      owner: actions,
    };
    for (const r of ROLES) expect(actions.filter((a) => can(r, a)).sort(), r).toEqual([...table[r]].sort());
  });
  it("only admins and owners clean up media", () => {
    expect(can("creator", "clean_media")).toBe(false);
    expect(can("admin", "clean_media")).toBe(true);
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

describe("deleting an event", () => {
  const e = { draft: true, slug: "my-talk", registrations: 0, attendance: 0 };
  it("lets a creator delete their draft once the web address is typed", () => {
    expect(canDeleteEvent("creator", e, "my-talk").ok).toBe(true);
    expect(canDeleteEvent("creator", e, "  my-talk ").ok).toBe(true);
    expect(canDeleteEvent("creator", e, "my-tal").ok).toBe(false);
  });
  it("keeps live events for admins", () => {
    expect(canDeleteEvent("creator", { ...e, draft: false }, "my-talk").ok).toBe(false);
    expect(canDeleteEvent("admin", { ...e, draft: false }, "my-talk").ok).toBe(true);
  });
  it("refuses while people have registered or been marked present", () => {
    const r = canDeleteEvent("owner", { ...e, registrations: 3 }, "my-talk");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/3 registrations/);
    expect(canDeleteEvent("owner", { ...e, attendance: 1 }, "my-talk").ok).toBe(false);
  });
  it("members may not delete", () => {
    expect(canDeleteEvent("member", e, "my-talk").ok).toBe(false);
  });
});

describe("navigation", () => {
  const links = (r: Role) => navFor(r).map((n) => n.label);
  it("shows each role only what it can use", () => {
    expect(links("member")).toEqual(["Dashboard", "Applications", "Registrations", "Questions", "Attendance"]);
    expect(links("creator")).toEqual(["Dashboard", "Events", "Applications", "Registrations", "Questions", "Attendance"]);
    expect(links("admin")).toEqual(["Dashboard", "Events", "Members", "Applications", "Registrations", "Questions", "Attendance", "Releases", "Media"]);
    expect(links("owner")).toEqual(["Dashboard", "Events", "Members", "Applications", "Registrations", "Questions", "Attendance", "Releases", "Media", "People"]);
  });
});
