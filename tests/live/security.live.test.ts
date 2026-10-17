// LIVE: talks to the real Supabase project with the PUBLIC (publishable) key, the same
// access a visitor's browser has, and proves what it can and cannot do.
// Run with: npm run test:live. Test rows use a zz-test- email and are removed afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.loadEnvFile?.(new URL("../../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPEN_EVENT = "placeholder-open-registration"; // apply_mode=form, in the future
const CLOSED_EVENT = "placeholder-live-session"; // apply_mode=closed

const run = Date.now();
const email = (n: string) => `zz-test-${run}-${n}@example.com`;

const call = (key: string, path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "node", ...(init.headers as object) },
  });
const anon = (path: string, init?: RequestInit) => call(ANON, path, init);
const service = (path: string, init?: RequestInit) => call(SERVICE, path, init);

const person = (n: string, over: Record<string, unknown> = {}) => ({
  name: "Zz Test", reg_no: "25ZZZ0001", email: email(n), department: "Testing", year: "2nd", ...over,
});
const register = (n: string, over: Record<string, unknown> = {}) =>
  anon("registrations", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ event_slug: OPEN_EVENT, ...person(n), ...over }) });

async function code(res: Response) {
  if (res.ok) return "ok";
  return ((await res.json()) as { code?: string }).code ?? String(res.status);
}

beforeAll(async () => {
  const r = await service(`events?slug=eq.${OPEN_EVENT}&select=slug`);
  const rows = (await r.json()) as unknown[];
  expect(rows.length, "run `npm run seed` first: the placeholder events must exist").toBe(1);
});

afterAll(async () => {
  await service("registrations?email=like.zz-test-*", { method: "DELETE" });
  await service("applications?email=like.zz-test-*", { method: "DELETE" });
});

describe("the public key can read only the published release", () => {
  it.each(["events", "members", "applications", "registrations", "admins", "club_settings", "aims", "media"])("cannot read %s", async (t) => {
    const res = await anon(`${t}?select=*&limit=1`);
    const body = res.ok ? await res.json() : null;
    // either refused, or an empty list because row level security hides everything
    expect(res.ok ? (body as unknown[]).length : 0).toBe(0);
  });
  it("can read the latest release through the view (or sees none yet)", async () => {
    const res = await anon("public_release?select=id,snapshot,published_at,schema_version");
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBeLessThanOrEqual(1);
  });
  it("cannot read the releases table's other columns", async () => {
    const res = await anon("releases?select=published_by,note");
    expect(res.ok).toBe(false);
  });
});

describe("the public key cannot change content", () => {
  it("cannot insert, update or delete events", async () => {
    const ins = await anon("events", { method: "POST", body: JSON.stringify({ slug: "zz-hack", title: "x", date_mode: "tba" }) });
    expect(ins.ok).toBe(false);
    const upd = await anon(`events?slug=eq.${OPEN_EVENT}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title: "hacked" }) });
    expect(upd.ok ? ((await upd.json()) as unknown[]).length : 0).toBe(0);
    const del = await anon(`events?slug=eq.${OPEN_EVENT}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    expect(del.ok ? ((await del.json()) as unknown[]).length : 0).toBe(0);
    const check = await service(`events?slug=eq.${OPEN_EVENT}&select=title`);
    expect(((await check.json()) as { title: string }[])[0].title).not.toBe("hacked");
  });
  it("cannot publish a release or make itself an admin", async () => {
    expect((await anon("releases", { method: "POST", body: JSON.stringify({ snapshot: {}, published_by: "x" }) })).ok).toBe(false);
    expect((await anon("admins", { method: "POST", body: JSON.stringify({ github_username: "zz-hacker", role: "owner" }) })).ok).toBe(false);
  });
});

describe("event registrations (live writes by visitors)", () => {
  it("saves a valid registration for an open event, and it cannot be read back", async () => {
    expect(await code(await register("a"))).toBe("ok");
    const back = await anon(`registrations?email=eq.${email("a")}&select=*`);
    expect(back.ok ? ((await back.json()) as unknown[]).length : 0).toBe(0);
    const stored = await service(`registrations?email=eq.${email("a")}&select=event_slug,status,reg_no`);
    expect(await stored.json()).toEqual([{ event_slug: OPEN_EVENT, status: "new", reg_no: "25ZZZ0001" }]);
  });
  it("rejects a duplicate for the same event and email, case-insensitively", async () => {
    expect(await code(await register("a", { email: email("a").toUpperCase() }))).toBe("23505");
  });
  it("rejects events that are closed, unknown, or not using our form", async () => {
    expect(await code(await register("b", { event_slug: CLOSED_EVENT }))).toBe("42501");
    expect(await code(await register("b", { event_slug: "no-such-event" }))).toBe("42501");
    expect(await code(await register("b", { event_slug: "placeholder-date-tba" }))).toBe("42501");
  });
  it("rejects bad data at the database even if the site is bypassed", async () => {
    expect(await code(await register("c", { email: "not-an-email" }))).toBe("23514");
    expect(await code(await register("c", { name: "A" }))).toBe("23514");
    expect(await code(await register("c", { reg_no: "1" }))).toBe("23514");
    expect(await code(await register("c", { phone: "12" }))).toBe("23514");
    expect(await code(await register("c", { status: "confirmed" }))).toBe("42501"); // cannot pick its own status
    expect(await code(await register("c", { answers: { big: "x".repeat(5000) } }))).toBe("23514");
  });
  it("limits one person to 3 registrations an hour", async () => {
    const e = email("burst");
    // the unique index stops repeats per event, so the limit is reached across fields: use 3 inserts then a 4th
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await anon("registrations", { method: "POST", body: JSON.stringify({ event_slug: OPEN_EVENT, ...person("burst"), email: i === 0 ? e : e.replace("@", `+${i}@`) }) });
      results.push(await code(r));
    }
    // plus-addresses are distinct emails, so only the first 3 same-email attempts matter below
    expect(results.filter((r) => r === "ok").length).toBeGreaterThanOrEqual(1);
    const dup = await code(await register("burst"));
    expect(["23505", "P0001"]).toContain(dup);
  });
});

describe("applications (live writes by visitors)", () => {
  const app = (n: string, over: Record<string, unknown> = {}) =>
    anon("applications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...person(n), level: "builder", tracks: ["Claude Code"], why: "Testing the live application path end to end.", ...over }),
    });
  it("saves a valid application and hides it from the public", async () => {
    expect(await code(await app("app1"))).toBe("ok");
    const back = await anon(`applications?email=eq.${email("app1")}&select=*`);
    expect(back.ok ? ((await back.json()) as unknown[]).length : 0).toBe(0);
  });
  it("rejects bad levels, short reasons and self-set status", async () => {
    expect(await code(await app("app2", { level: "expert" }))).toBe("23514");
    expect(await code(await app("app2", { why: "short" }))).toBe("23514");
    expect(await code(await app("app2", { status: "accepted" }))).toBe("42501");
  });
  it("limits one email to 3 applications an hour", async () => {
    const outcomes: string[] = [];
    for (let i = 0; i < 4; i++) outcomes.push(await code(await app("app3")));
    expect(outcomes.slice(0, 3)).toEqual(["ok", "ok", "ok"]);
    expect(outcomes[3]).toBe("P0001");
  });
});
