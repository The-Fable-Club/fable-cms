// Run SQL against the Supabase database (migrations, checks).
// Needs the direct Postgres connection string in .env.local as DATABASE_URL (Supabase dashboard > Connect >
// "Direct connection" or the session pooler). It is a secret: it lives only in the git-ignored .env.local.
//   node scripts/db.mjs --file supabase/migrations/0005_x.sql
//   node scripts/db.mjs --sql "select 1"
import { readFileSync } from "node:fs";
import pg from "pg";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const file = arg("file");
const sql = arg("sql") ?? (file ? readFileSync(file, "utf8") : undefined);
if (!sql) {
  console.error('usage: node scripts/db.mjs (--file x.sql | --sql "...")');
  process.exit(2);
}

process.loadEnvFile(new URL("../.env.local", import.meta.url));
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env.local (see the comment at the top of this file)");
  process.exit(2);
}
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("sslmode");

const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const res = await client.query(sql);
  const results = Array.isArray(res) ? res : [res];
  for (const r of results) if (r.rows?.length) console.table(r.rows);
  console.log(`ok (${results.length} statement${results.length === 1 ? "" : "s"})`);
} catch (e) {
  console.error(`SQL error: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
