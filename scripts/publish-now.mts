// Publish from the command line with the service key (same publish() the CMS button uses).
// For maintenance and migrations; day to day, use the Publish button in the CMS.
//   npx tsx scripts/publish-now.mts "note about this release"
import { resolve } from "node:path";
import { publish, type PublishDeps } from "../src/lib/publish";
import type { EventRow, MemberRow } from "../src/lib/snapshot";

process.loadEnvFile(resolve(import.meta.dirname, "../.env.local"));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const rest = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "User-Agent": "node", ...(init.headers as object) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const deps: PublishDeps = {
  supabaseUrl: URL,
  now: () => new Date(),
  loadRows: async () => ({ events: (await rest("events?select=*")) as EventRow[], members: (await rest("members?select=*")) as MemberRow[] }),
  lastPublishedAt: async () => {
    const rows = (await rest("releases?select=published_at&order=id.desc&limit=1")) as { published_at: string }[];
    return rows[0] ? new Date(rows[0].published_at) : null;
  },
  insertRelease: async ({ snapshot, note, publishedBy }) => {
    const rows = (await rest("releases?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ snapshot, note, published_by: publishedBy, schema_version: 1 }) })) as { id: number }[];
    return { id: rows[0].id };
  },
  hookUrl: process.env.VERCEL_DEPLOY_HOOK_URL?.trim() || null,
  fetchHook: async (u) => ({ status: (await fetch(u, { method: "POST" })).status }),
  recordDeploy: async (id, state) => {
    await rest(`releases?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ deploy_state: state }) });
  },
};

const result = await publish(deps, { by: "maintenance-script", note: process.argv[2] ?? "published from the command line" });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
