// LIVE: proves the database itself enforces the four access levels, whatever the app does.
// Needs DATABASE_URL (direct Postgres string) in .env.local, otherwise the whole file is skipped.
// Everything happens inside ONE transaction that is rolled back at the end: fake users, fake
// admin rows and test data never reach the real tables.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

try {
  process.loadEnvFile(new URL("../../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
} catch {
  /* no .env.local */
}
const HAS_DB = Boolean(process.env.DATABASE_URL);

type Role = "member" | "creator" | "admin" | "owner";
const ROLES: Role[] = ["member", "creator", "admin", "owner"];
const uid: Record<Role, string> = {
  member: "00000000-0000-4000-8000-0000000000a1",
  creator: "00000000-0000-4000-8000-0000000000a2",
  admin: "00000000-0000-4000-8000-0000000000a3",
  owner: "00000000-0000-4000-8000-0000000000a4",
};

let client: pg.Client;
let liveEventId: number;
let draftEventId: number;
let appId: number;

/** Run one statement as `role` (row level security applies), inside a savepoint so an error does not kill the transaction. */
async function as(role: Role | "nobody", sql: string, params: unknown[] = []) {
  await client.query("savepoint s");
  try {
    await client.query("set local role authenticated");
    const sub = role === "nobody" ? "00000000-0000-4000-8000-0000000000ff" : uid[role];
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub, role: "authenticated" }), sub]);
    const r = await client.query(sql, params);
    return { ok: true as const, rows: r.rows, count: r.rowCount ?? 0 };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message, rows: [], count: 0 };
  } finally {
    await client.query("rollback to savepoint s");
    await client.query("reset role");
  }
}

const newEvent = (slug: string, draft: boolean) => ({
  sql: `insert into events (slug, title, kind, date_mode, start_date, time_mode, time_text, venue_mode, venue, seats_mode, apply_mode, summary, draft)
        values ($1, 'T', 'Workshop', 'exact', '2027-05-01', 'tba', '', 'tba', '', 'open', 'none', 's', $2) returning id`,
  params: [slug, draft],
});

beforeAll(async () => {
  if (!HAS_DB) return;
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.delete("sslmode");
  client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("begin");
  for (const r of ROLES) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
      [uid[r], `zz-role-${r}@example.com`],
    );
    await client.query(
      `insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1, 'github', $2, $3, now(), now(), now())`,
      [uid[r], `zz-role-${r}`, JSON.stringify({ user_name: `zz-role-${r}`, sub: `zz-role-${r}` })],
    );
    await client.query("insert into admins (github_username, role, added_by) values ($1, $2, 'live-test')", [`zz-role-${r}`, r]);
  }
  liveEventId = (await client.query(newEvent("zz-role-live", false).sql, newEvent("zz-role-live", false).params)).rows[0].id;
  draftEventId = (await client.query(newEvent("zz-role-draft", true).sql, newEvent("zz-role-draft", true).params)).rows[0].id;
  appId = (
    await client.query(
      `insert into applications (name, reg_no, email, department, year, level, why) values ('Zz Role','25ZZZ0001','zz-role@example.com','T','2nd','builder','Testing the role policies thoroughly.') returning id`,
    )
  ).rows[0].id;
});

afterAll(async () => {
  if (!HAS_DB || !client) return;
  await client.query("rollback");
  await client.end();
});

describe.skipIf(!HAS_DB)("access levels, enforced by the database", () => {
  it("each fake user resolves to the right level, and strangers get 0", async () => {
    for (const r of ROLES) expect((await as(r, "select role_rank() as n")).rows[0].n).toBe(ROLES.indexOf(r) + 1);
    expect((await as("nobody", "select role_rank() as n")).rows[0].n).toBe(0);
  });

  it("strangers (signed in, not on the list) can read nothing and write nothing", async () => {
    for (const t of ["events", "members", "applications", "registrations", "releases", "admins", "media"]) expect((await as("nobody", `select 1 from ${t} limit 1`)).count, t).toBe(0);
    expect((await as("nobody", newEvent("zz-x", true).sql, newEvent("zz-x", true).params)).ok).toBe(false);
  });

  describe("events", () => {
    it("who can see them", async () => {
      expect((await as("member", "select 1 from events")).count).toBe(0);
      for (const r of ["creator", "admin", "owner"] as const) expect((await as(r, "select 1 from events where slug like 'zz-role-%'")).count, r).toBe(2);
    });
    it("who can create live events and drafts", async () => {
      expect((await as("member", newEvent("zz-a", true).sql, newEvent("zz-a", true).params)).ok).toBe(false);
      expect((await as("creator", newEvent("zz-b", true).sql, newEvent("zz-b", true).params)).ok).toBe(true);
      expect((await as("creator", newEvent("zz-c", false).sql, newEvent("zz-c", false).params)).ok).toBe(false);
      for (const r of ["admin", "owner"] as const) {
        expect((await as(r, newEvent("zz-d", false).sql, newEvent("zz-d", false).params)).ok, r).toBe(true);
      }
    });
    it("who can edit what", async () => {
      expect((await as("member", "update events set title = 'x' where id = $1", [draftEventId])).count).toBe(0);
      expect((await as("creator", "update events set title = 'x' where id = $1", [draftEventId])).count).toBe(1);
      expect((await as("creator", "update events set title = 'x' where id = $1", [liveEventId])).count).toBe(0);
      expect((await as("admin", "update events set title = 'x' where id = $1", [liveEventId])).count).toBe(1);
      expect((await as("owner", "update events set title = 'x' where id = $1", [liveEventId])).count).toBe(1);
    });
    it("a creator cannot take a draft live; an admin can", async () => {
      expect((await as("creator", "update events set draft = false where id = $1", [draftEventId])).ok).toBe(false);
      expect((await as("admin", "update events set draft = false where id = $1", [draftEventId])).count).toBe(1);
    });
    it("who can delete", async () => {
      expect((await as("creator", "delete from events where id = $1", [liveEventId])).count).toBe(0);
      expect((await as("creator", "delete from events where id = $1", [draftEventId])).count).toBe(1);
      expect((await as("admin", "delete from events where id = $1", [liveEventId])).count).toBe(1);
    });
  });

  describe("members", () => {
    const member = `insert into members (slug, name, role, "group", position, department) values ('zz-m', 'Zz', 'r', 'Member', 1, 'd')`;
    it("only admins and owners manage them", async () => {
      expect((await as("member", member)).ok).toBe(false);
      expect((await as("creator", member)).ok).toBe(false);
      expect((await as("admin", member)).ok).toBe(true);
      expect((await as("owner", member)).ok).toBe(true);
      expect((await as("creator", "select 1 from members")).count).toBe(0);
      expect((await as("admin", "select 1 from members")).count).toBeGreaterThan(0);
    });
  });

  describe("applications and registrations", () => {
    it("every level can read them", async () => {
      for (const r of ROLES) expect((await as(r, "select 1 from applications where id = $1", [appId])).count, r).toBe(1);
      for (const r of ROLES) expect((await as(r, "select 1 from registrations")).ok, r).toBe(true);
    });
    it("only admins and owners change them", async () => {
      expect((await as("member", "update applications set status = 'reviewed' where id = $1", [appId])).count).toBe(0);
      expect((await as("creator", "update applications set status = 'reviewed' where id = $1", [appId])).count).toBe(0);
      expect((await as("admin", "update applications set status = 'reviewed' where id = $1", [appId])).count).toBe(1);
      expect((await as("owner", "update applications set status = 'reviewed' where id = $1", [appId])).count).toBe(1);
      expect((await as("creator", "delete from applications where id = $1", [appId])).count).toBe(0);
    });
  });

  describe("releases (publishing)", () => {
    const release = `insert into releases (snapshot, published_by, schema_version) values ('{}'::jsonb, 'zz', 1)`;
    it("members and creators cannot see history or publish", async () => {
      for (const r of ["member", "creator"] as const) {
        expect((await as(r, "select 1 from releases")).count, r).toBe(0);
        expect((await as(r, release)).ok, r).toBe(false);
      }
    });
    it("admins and owners can", async () => {
      for (const r of ["admin", "owner"] as const) expect((await as(r, release)).ok, r).toBe(true);
      expect((await as("admin", "select 1 from releases")).count).toBeGreaterThan(0);
    });
  });

  describe("people", () => {
    const add = `insert into admins (github_username, role, added_by) values ('zz-newbie', 'member', 'x')`;
    it("only owners see or change the list", async () => {
      for (const r of ["member", "creator", "admin"] as const) {
        expect((await as(r, "select 1 from admins")).count, r).toBe(0);
        expect((await as(r, add)).ok, r).toBe(false);
        expect((await as(r, "update admins set role = 'owner' where github_username = $1", [`zz-role-${r}`])).count, r).toBe(0);
      }
      expect((await as("owner", "select 1 from admins")).count).toBeGreaterThanOrEqual(4);
      expect((await as("owner", add)).ok).toBe(true);
    });
    it("the old 'editor' level is not accepted any more", async () => {
      expect((await as("owner", "insert into admins (github_username, role, added_by) values ('zz-old', 'editor', 'x')")).ok).toBe(false);
    });
  });
});
