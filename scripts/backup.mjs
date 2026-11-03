// Saves every table in the public schema to one JSON file: backups/<date>.json (git-ignored).
// Our own safety net: don't count on restoring from Supabase's backups on the free plan.
// The file holds applicants' personal details: keep it on your machine or the club drive, never in git or chat.
//   node scripts/backup.mjs
// Restore with scripts/restore.mjs (see docs/RECOVERY.md). Needs DATABASE_URL in .env.local.
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { loadEnv } from "./env-file.mjs";

const ENV = loadEnv(); // .env.local, or ENV_FILE (see scripts/env-file.mjs)
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env.local (see scripts/db.mjs)");
  process.exit(2);
}
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("sslmode");
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: tables } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  const out = { taken_at: new Date().toISOString(), tables: {} };
  for (const { table_name } of tables) {
    const { rows } = await client.query(`select * from public."${table_name}"`);
    out.tables[table_name] = rows;
    console.log(`${table_name.padEnd(22)} ${rows.length} rows`);
  }
  const dir = new URL("../backups/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const name = `${ENV.staging ? "staging-" : ""}${out.taken_at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  writeFileSync(new URL(name, dir), JSON.stringify(out, null, 1));
  console.log(`saved backups/${name}`);
} finally {
  await client.end();
}
