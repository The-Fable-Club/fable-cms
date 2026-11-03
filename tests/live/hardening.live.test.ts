// LIVE, read-only: the database configuration stays hardened (migrations 0011-0013).
// Catalog queries and a few requests with the public key; nothing is written.
// Runs against production (npm run test:live) or staging (npm run test:live:staging).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { loadEnv } from "../../scripts/env-file.mjs";

const ENV = loadEnv(); // .env.local, or ENV_FILE=.env.staging.local
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HAS_DB = Boolean(process.env.DATABASE_URL);

let client: pg.Client;
const q = async <T = Record<string, unknown>>(sql: string) => (await client.query(sql)).rows as T[];

beforeAll(async () => {
  if (!HAS_DB) return;
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.delete("sslmode");
  client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
});
afterAll(async () => {
  if (client) await client.end();
});

describe.skipIf(!HAS_DB)("database configuration", () => {
  it("every public table has row level security on", async () => {
    const rows = await q<{ relname: string }>(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("the public role holds exactly the table privileges it uses", async () => {
    const rows = await q<{ t: string; p: string }>(
      `select table_name t, string_agg(privilege_type, ',' order by privilege_type) p
         from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' group by 1 order by 1`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.t, r.p]))).toEqual({
      applications: "INSERT",
      event_questions: "INSERT",
      public_release: "SELECT",
      registrations: "INSERT",
    });
  });

  it("no app role can TRUNCATE, add triggers or references (TRUNCATE skips row level security)", async () => {
    const rows = await q(
      `select grantee, table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')`,
    );
    expect(rows).toEqual([]);
  });

  it("every function in public has a fixed search_path", async () => {
    const rows = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) x where x like 'search_path=%'))`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("the public role can call only the functions it needs", async () => {
    const rows = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["event_accepts_questions", "event_accepts_registrations", "latest_release_id", "set_updated_at"]);
  });

  it("app roles can't read the vault", async () => {
    const rows = await q("select r from unnest(array['anon','authenticated']) r where has_table_privilege(r, 'vault.decrypted_secrets', 'select')");
    expect(rows).toEqual([]);
  });

  it("the CMS must keep an owner, and haise-727 as one (0011, 0012)", async () => {
    const rows = await q<{ tgname: string }>("select tgname from pg_trigger where tgname in ('t_admins_keep_owner', 't_admins_no_truncate') order by 1");
    expect(rows.map((r) => r.tgname)).toEqual(["t_admins_keep_owner", "t_admins_no_truncate"]);
    const [owner] = await q<{ n: number }>("select count(*)::int n from admins where github_username = 'haise-727' and role = 'owner'");
    expect(owner.n).toBe(1);
  });

  it("alert emails are capped and skip test rows (0012, 0013)", async () => {
    const [f] = await q<{ def: string }>("select pg_get_functiondef('public.notify_new_application()'::regprocedure) def");
    expect(f.def).toContain("last_hour > 10 or last_day > 50");
    const [t] = await q<{ def: string }>("select pg_get_triggerdef(oid) def from pg_trigger where tgname = 't_notify_new_application'");
    expect(t.def).toContain("zz-%");
  });

  it("photo uploads accept raster images only, with a size limit", async () => {
    const [b] = await q<{ types: string[]; size: number }>("select allowed_mime_types types, file_size_limit size from storage.buckets where id = 'media'");
    expect([...b.types].sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(Number(b.size)).toBeGreaterThan(0);
  });
});

describe("what the public key reaches over the API", () => {
  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${URL_}${path}`, { headers: { apikey: ANON, "User-Agent": "node", ...headers } });

  it("internal schemas (net, vault, auth) are not exposed", async () => {
    for (const schema of ["net", "vault", "auth", "storage"]) {
      const r = await get("/rest/v1/anything?select=*", { "Accept-Profile": schema });
      expect(r.status, schema).toBe(406);
    }
  });

  it("GraphQL is off", async () => {
    const r = await fetch(`${URL_}/graphql/v1`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ query: "{__typename}" }) });
    expect(await r.text()).toContain("not enabled");
  });

  it("tables the public never reads answer with nothing", async () => {
    for (const t of ["admins", "events", "members", "applications", "registrations", "media", "audit_log", "club_settings", "aims"]) {
      const r = await get(`/rest/v1/${t}?select=*&limit=1`);
      const rows = r.ok ? ((await r.json()) as unknown[]) : [];
      expect(rows.length, t).toBe(0);
    }
  });

  it("the storage bucket can't be listed", async () => {
    const r = await fetch(`${URL_}/storage/v1/object/list/media`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "" }) });
    const rows = r.ok ? ((await r.json()) as unknown[]) : [];
    expect(rows.length).toBe(0);
  });

  it.skipIf(ENV.staging)("production signs in with GitHub only", async () => {
    const s = (await (await get("/auth/v1/settings")).json()) as { external: Record<string, boolean> };
    expect(Object.entries(s.external).filter(([, on]) => on).map(([k]) => k)).toEqual(["github"]);
  });
});
