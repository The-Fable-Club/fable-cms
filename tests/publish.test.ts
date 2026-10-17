import { describe, expect, it, vi } from "vitest";
import { publish, triggerDeploy, type PublishDeps } from "@/lib/publish";
import type { EventRow } from "@/lib/snapshot";

const event = (o: Partial<EventRow> = {}): EventRow => ({
  id: 1, slug: "a", title: "A", kind: "Workshop", phase: 1, status_override: null, date_mode: "exact", start_date: "2026-11-20", end_date: null,
  date_month: null, date_text: null, time_mode: "tba", time_text: "", venue_mode: "tba", venue: "", seats_mode: "tba", seats: null,
  apply_mode: "none", apply_url: null, summary: "s", description: "d", highlights: [], art: "pointer", photo_path: null, hub: [], archived: false, ...o,
});

function deps(over: Partial<PublishDeps> = {}) {
  const calls = { insert: vi.fn(), hook: vi.fn(), record: vi.fn() };
  const d: PublishDeps = {
    supabaseUrl: "https://p.supabase.co",
    now: () => new Date("2026-10-17T10:00:00Z"),
    loadRows: async () => ({ events: [event()], members: [] }),
    lastPublishedAt: async () => null,
    insertRelease: async (r) => { calls.insert(r); return { id: 7 }; },
    hookUrl: "https://api.vercel.com/hook/abc",
    fetchHook: async (u) => { calls.hook(u); return { status: 201 }; },
    recordDeploy: async (id, s) => { calls.record(id, s); },
    ...over,
  };
  return { d, calls };
}

describe("publish", () => {
  it("saves the release, then triggers the deploy and records it", async () => {
    const { d, calls } = deps();
    const r = await publish(d, { by: "haise-727", note: " launch " });
    expect(r).toMatchObject({ ok: true, releaseId: 7, deploy: "triggered", counts: { events: 1, members: 0 } });
    expect(calls.insert.mock.calls[0][0]).toMatchObject({ note: "launch", publishedBy: "haise-727" });
    expect(calls.hook).toHaveBeenCalledWith("https://api.vercel.com/hook/abc");
    expect(calls.record).toHaveBeenCalledWith(7, "triggered");
  });

  it("blocks a second publish within a minute and says how long to wait", async () => {
    const { d, calls } = deps({ lastPublishedAt: async () => new Date("2026-10-17T09:59:30Z") });
    const r = await publish(d, { by: "x" });
    expect(r).toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: 30 });
    expect(calls.insert).not.toHaveBeenCalled();
    expect(calls.hook).not.toHaveBeenCalled();
  });

  it("allows publishing once a minute has passed", async () => {
    const { d } = deps({ lastPublishedAt: async () => new Date("2026-10-17T09:58:59Z") });
    expect((await publish(d, { by: "x" })).ok).toBe(true);
  });

  it("refuses an invalid site: nothing saved, nothing deployed, problems named", async () => {
    const { d, calls } = deps({ loadRows: async () => ({ events: [event({ title: "Broken", start_date: "2026-02-30" })], members: [] }) });
    const r = await publish(d, { by: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "invalid") expect(r.problems[0]).toMatchObject({ label: "Broken", field: "date.start" });
    expect(calls.insert).not.toHaveBeenCalled();
    expect(calls.hook).not.toHaveBeenCalled();
  });

  it("keeps the saved release when the hook answers an error", async () => {
    const { d, calls } = deps({ fetchHook: async () => ({ status: 500 }) });
    const r = await publish(d, { by: "x" });
    expect(r).toMatchObject({ ok: true, releaseId: 7, deploy: "failed" });
    expect(r.ok && r.error).toMatch(/500/);
    expect(calls.record).toHaveBeenCalledWith(7, "failed");
  });

  it("keeps the saved release when Vercel is unreachable", async () => {
    const { d } = deps({ fetchHook: async () => { throw new Error("offline"); } });
    const r = await publish(d, { by: "x" });
    expect(r).toMatchObject({ ok: true, deploy: "failed" });
    expect(r.ok && r.error).toMatch(/offline/);
  });

  it("works without a hook: saved, not deployed, clearly said", async () => {
    const { d, calls } = deps({ hookUrl: null });
    const r = await publish(d, { by: "x" });
    expect(r).toMatchObject({ ok: true, deploy: "not_configured" });
    expect(calls.hook).not.toHaveBeenCalled();
  });

  it("reports database failures instead of throwing", async () => {
    const { d } = deps({ insertRelease: async () => { throw new Error("db down"); } });
    expect(await publish(d, { by: "x" })).toEqual({ ok: false, reason: "error", message: "db down" });
    const { d: d2 } = deps({ loadRows: async () => { throw new Error("no rows"); } });
    expect(await publish(d2, { by: "x" })).toMatchObject({ ok: false, reason: "error" });
  });

  it("a failure to record the deploy label does not hide a successful publish", async () => {
    const { d } = deps({ recordDeploy: async () => { throw new Error("rls"); } });
    expect(await publish(d, { by: "x" })).toMatchObject({ ok: true, deploy: "triggered" });
  });

  it("can publish an empty site (all content removed)", async () => {
    const { d } = deps({ loadRows: async () => ({ events: [], members: [] }) });
    expect(await publish(d, { by: "x" })).toMatchObject({ ok: true, counts: { events: 0, members: 0 } });
  });
});

describe("triggerDeploy (retry)", () => {
  it("re-requests the build for an existing release", async () => {
    const hook = vi.fn(async () => ({ status: 200 }));
    const record = vi.fn(async () => {});
    const r = await triggerDeploy({ hookUrl: "https://h", fetchHook: hook, recordDeploy: record }, 3);
    expect(r.deploy).toBe("triggered");
    expect(record).toHaveBeenCalledWith(3, "triggered");
  });
});
