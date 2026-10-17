// Runs the live test suite (real Supabase project + real deploy hook). Never part of `npm test`.
import { spawnSync } from "node:child_process";
const r = spawnSync("npx", ["vitest", "run", "tests/live"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, LIVE: "1" },
});
process.exit(r.status ?? 1);
