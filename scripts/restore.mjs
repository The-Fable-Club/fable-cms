// Puts rows from a backup (scripts/backup.mjs) back into one table. Rows that still exist are left alone
// (matched on the primary key), so running it twice is safe. It never deletes anything.
//   node scripts/restore.mjs --file backups/2026-11-03-10-00-00.json --table admins
//   node scripts/restore.mjs --file backups/....json --table events --dry-run   (count only, changes rolled back)
// Needs DATABASE_URL in .env.local. See docs/RECOVERY.md.
import { readFileSync } from "node:fs";
import pg from "pg";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const file = arg("file");
const table = arg("table");
const dry = process.argv.includes("--dry-run");
if (!file || !table || !/^[a-z_]+$/.test(table)) {
  console.error("usage: node scripts/restore.mjs --file backups/x.json --table <name> [--dry-run]");
  process.exit(2);
}
const rows = JSON.parse(readFileSync(file, "utf8")).tables?.[table];
if (!Array.isArray(rows)) {
  console.error(`no table "${table}" in ${file}`);
  process.exit(2);
}

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("sslmode");
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  // "overriding system value" keeps the original ids of identity columns
  const res = await client.query(
    `insert into public."${table}" overriding system value
     select * from json_populate_recordset(null::public."${table}", $1::json)
     on conflict do nothing`,
    [JSON.stringify(rows)],
  );
  await client.query(dry ? "rollback" : "commit");
  console.log(`${table}: ${res.rowCount} of ${rows.length} rows ${dry ? "would be restored (dry run, nothing changed)" : "restored"}; the rest already existed`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(`restore failed, nothing changed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
