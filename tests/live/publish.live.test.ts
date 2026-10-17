// LIVE end-to-end: change content in the database, Publish through the real publish core,
// let Vercel really rebuild the public site, and read the live pages.
// Uses the service key in place of a signed-in admin (the CMS screens call the same publish()).
// Adds one temporary event (slug zz-live-test) and removes it again, publishing both times.
import { afterAll, describe, expect, it } from "vitest";
import { publish, type PublishDeps } from "@/lib/publish";
import type { EventRow, MemberRow } from "@/lib/snapshot";

process.loadEnvFile?.(new URL("../../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HOOK = process.env.VERCEL_DEPLOY_HOOK_URL!;
const SITE = "https://www.thefableclub.com";
const SLUG = "zz-live-test";
const TITLE = "Zz Live Test Event";

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", "User-Agent": "node", ...(init.headers as object) },
  });
const json = async <T,>(r: Response) => {
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T; // inserts with return=minimal have an empty body
};

const deps = (hookUrl: string | null): PublishDeps => ({
  supabaseUrl: URL_,
  now: () => new Date(),
  loadRows: async () => ({
    events: await json<EventRow[]>(await rest("events?select=*")),
    members: await json<MemberRow[]>(await rest("members?select=*")),
  }),
  lastPublishedAt: async () => {
    const rows = await json<{ published_at: string }[]>(await rest("releases?select=published_at&order=id.desc&limit=1"));
    return rows[0] ? new Date(rows[0].published_at) : null;
  },
  insertRelease: async ({ snapshot, note, publishedBy }) => {
    const rows = await json<{ id: number }[]>(
      await rest("releases?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ snapshot, note, published_by: publishedBy, schema_version: 1 }) }),
    );
    return { id: rows[0].id };
  },
  hookUrl,
  fetchHook: async (u) => ({ status: (await fetch(u, { method: "POST" })).status }),
  recordDeploy: async (id, state) => {
    await rest(`releases?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ deploy_state: state }) });
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs = 300_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch {
      /* keep polling */
    }
    await sleep(8000);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
const page = async (path: string) => (await fetch(`${SITE}${path}?t=${Date.now()}`, { cache: "no-store" })).text();
async function waitForRateLimit() {
  const rows = await json<{ published_at: string }[]>(await rest("releases?select=published_at&order=id.desc&limit=1"));
  if (rows[0]) await sleep(Math.max(0, 61_000 - (Date.now() - new Date(rows[0].published_at).getTime())));
}

const testEvent = {
  slug: SLUG, title: TITLE, kind: "Workshop", phase: 1, date_mode: "exact", start_date: "2026-10-19", end_date: null,
  time_mode: "text", time_text: "6 pm", venue_mode: "tba", venue: "", seats_mode: "open", apply_mode: "form",
  summary: "Temporary event created by the live publishing test.", description: "Temporary.", highlights: ["Temporary"], art: "search",
};

afterAll(async () => {
  await rest(`events?slug=eq.${SLUG}`, { method: "DELETE" }); // never leave the test event behind
});

describe("publish -> rebuild -> live site", () => {
  it("a failing deploy hook still saves the release and says it failed", async () => {
    await waitForRateLimit();
    const r = await publish(deps("https://api.vercel.com/v1/integrations/deploy/prj_does_not_exist/nope"), { by: "live-test", note: "hook failure drill" });
    expect(r).toMatchObject({ ok: true, deploy: "failed" });
    if (r.ok) {
      const row = await json<{ deploy_state: string }[]>(await rest(`releases?id=eq.${r.releaseId}&select=deploy_state`));
      expect(row[0].deploy_state).toBe("failed");
    }
  }, 120_000);

  it("a new event reaches the event page, the events list and the home announcement", async () => {
    await json(await rest("events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(testEvent) }));
    await waitForRateLimit();
    const r = await publish(deps(HOOK), { by: "live-test", note: "live test: add event" });
    expect(r).toMatchObject({ ok: true, deploy: "triggered" });

    await waitFor(async () => (await page(`/events/${SLUG}`)).includes(TITLE), "the new event page");
    const events = await page("/events");
    expect(events).toContain(TITLE);
    const home = await page("/");
    expect(home).toContain(TITLE);
    expect(home).toContain("Registrations open"); // a registration-open event is announced
    const eventPage = await page(`/events/${SLUG}`);
    expect(eventPage).toContain("Register for this event"); // the form appears
    expect(eventPage).toContain("Venue to be announced");
  }, 420_000);

  it("the live registration form works for the new event and its registrations are closed afterwards", async () => {
    const body = (n: string) => JSON.stringify({ event_slug: SLUG, name: "Zz Test", reg_no: "25ZZZ0009", email: `zz-test-pub-${n}@example.com`, department: "Testing", year: "3rd", consent: true });
    const res = await fetch(`${SITE}/api/registrations`, { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: body("1") });
    expect(await res.json()).toEqual({ ok: true });
    await rest("registrations?email=like.zz-test-*", { method: "DELETE" });
  });

  it("removing the event and publishing again takes it off every page", async () => {
    await rest(`events?slug=eq.${SLUG}`, { method: "DELETE" });
    await waitForRateLimit();
    const r = await publish(deps(HOOK), { by: "live-test", note: "live test: remove event" });
    expect(r).toMatchObject({ ok: true, deploy: "triggered" });
    await waitFor(async () => !(await page("/events")).includes(TITLE), "the event to disappear from /events");
    expect(await page("/")).not.toContain(TITLE);
    const gone = await fetch(`${SITE}/events/${SLUG}`);
    expect((await gone.text()).includes(TITLE)).toBe(false);
    // and it can no longer take registrations
    const res = await fetch(`${SITE}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: SITE },
      body: JSON.stringify({ event_slug: SLUG, name: "Zz Test", reg_no: "25ZZZ0009", email: "zz-test-pub-2@example.com", department: "Testing", year: "3rd", consent: true }),
    });
    expect((await res.json()).code).toBe("closed");
  }, 420_000);
});
