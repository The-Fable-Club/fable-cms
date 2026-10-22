// LIVE: migration 0007 on the real database, using the PUBLIC key like a visitor's browser.
// Skipped until 0007 is applied. Test rows use zz-test- and are removed afterwards; the event's
// EventHub link and today's click count are put back as they were.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.loadEnvFile?.(new URL("../../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVENT = "placeholder-open-registration";
const run = Date.now();
const email = (n: string) => `zz-test-${run}-${n}@example.com`;

const call = (key: string, path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "node", ...(init.headers as object) },
  });
const anon = (p: string, i?: RequestInit) => call(ANON, p, i);
const service = (p: string, i?: RequestInit) => call(SERVICE, p, i);
const code = async (r: Response) => (r.ok ? "ok" : (((await r.json()) as { code?: string }).code ?? String(r.status)));
const ask = (o: Record<string, unknown>) => anon("event_questions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ event_slug: EVENT, question: "Is this a live test question?", ...o }) });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const applied = await service("event_questions?select=id&limit=1").then((r) => r.ok).catch(() => false);
let savedLink: string | null = null;
let savedClicks: number | null = null;

beforeAll(async () => {
  if (!applied) return;
  const ev = (await (await service(`events?slug=eq.${EVENT}&select=eventhub_url`)).json()) as { eventhub_url: string | null }[];
  savedLink = ev[0]?.eventhub_url ?? null;
  const c = (await (await service(`event_clicks?event_slug=eq.${EVENT}&day=eq.${today}&select=clicks`)).json()) as { clicks: number }[];
  savedClicks = c[0]?.clicks ?? null;
});

afterAll(async () => {
  if (!applied) return;
  await service("event_questions?email=like.zz-test-*", { method: "DELETE" });
  await service("event_questions?question=like.*live%20test*", { method: "DELETE" });
  await service(`events?slug=eq.${EVENT}`, { method: "PATCH", body: JSON.stringify({ eventhub_url: savedLink }) });
  if (savedClicks === null) await service(`event_clicks?event_slug=eq.${EVENT}&day=eq.${today}`, { method: "DELETE" });
  else await service(`event_clicks?event_slug=eq.${EVENT}&day=eq.${today}`, { method: "PATCH", body: JSON.stringify({ clicks: savedClicks }) });
});

describe.skipIf(!applied)("event questions", () => {
  it("anyone can ask about a live event, with or without name and email", async () => {
    expect(await code(await ask({}))).toBe("ok");
    expect(await code(await ask({ name: "Zz", email: email("a") }))).toBe("ok");
  });
  it("the public cannot read questions back", async () => {
    const r = await anon(`event_questions?event_slug=eq.${EVENT}&select=*`);
    expect(r.ok ? ((await r.json()) as unknown[]).length : 0).toBe(0);
  });
  it("cannot answer, publish or hide its own question", async () => {
    expect(await code(await ask({ answer: "Yes" }))).toBe("42501");
    expect(await code(await ask({ show_on_site: true }))).toBe("42501");
    expect(await code(await ask({ hidden: true }))).toBe("42501");
  });
  it("only events that exist and are live", async () => {
    expect(await code(await ask({ event_slug: "no-such-event" }))).toBe("42501");
  });
  it("the database rejects bad data", async () => {
    expect(await code(await ask({ question: "Hi" }))).toBe("23514");
    expect(await code(await ask({ email: "not-an-email" }))).toBe("23514");
    expect(await code(await ask({ question: "x".repeat(501) }))).toBe("23514");
  });
  it("one email may ask at most 5 questions an hour", async () => {
    const out: string[] = [];
    for (let i = 0; i < 6; i++) out.push(await code(await ask({ email: email("burst") })));
    expect(out.slice(0, 5)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(out[5]).toBe("P0001");
  });
});

describe.skipIf(!applied)("EventHub link and click counter", () => {
  const clicks = async () => ((await (await service(`event_clicks?event_slug=eq.${EVENT}&day=eq.${today}&select=clicks`)).json()) as { clicks: number }[])[0]?.clicks ?? 0;
  const press = () => anon("rpc/count_eventhub_click", { method: "POST", body: JSON.stringify({ p_slug: EVENT }) });

  it("the database only accepts real EventHub links", async () => {
    for (const bad of ["http://eventhubcc.vit.ac.in/x", "https://eventhubcc.vit.ac.in.evil.example/x", "https://evil.example/"])
      expect(await code(await service(`events?slug=eq.${EVENT}`, { method: "PATCH", body: JSON.stringify({ eventhub_url: bad }) })), bad).toBe("23514");
    expect(await code(await service(`events?slug=eq.${EVENT}`, { method: "PATCH", body: JSON.stringify({ eventhub_url: "https://eventhubcc.vit.ac.in/EventHub/" }) }))).toBe("ok");
  });
  it("a press is counted, numbers only, for an event with a link", async () => {
    const before = await clicks();
    expect((await press()).ok).toBe(true);
    expect((await press()).ok).toBe(true);
    expect(await clicks()).toBe(before + 2);
  });
  it("events without a link are not counted, and the public cannot read the counts", async () => {
    await anon("rpc/count_eventhub_click", { method: "POST", body: JSON.stringify({ p_slug: "placeholder-date-tba" }) });
    const r = (await (await service(`event_clicks?event_slug=eq.placeholder-date-tba&select=clicks`)).json()) as unknown[];
    expect(r.length).toBe(0);
    const pub = await anon("event_clicks?select=*");
    expect(pub.ok ? ((await pub.json()) as unknown[]).length : 0).toBe(0);
  });
});
