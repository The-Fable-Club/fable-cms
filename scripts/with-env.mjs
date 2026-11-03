// Runs a command with the settings from ENV_FILE instead of .env.local:
//   ENV_FILE=.env.staging.local node scripts/with-env.mjs next dev -p 3201
// Next.js still reads .env.local by itself, but never overrides a variable that is already set
// (even to an empty string). So for a staging run, every name that exists only in .env.local
// (the deploy hook, Resend, ImageKit, ...) is set to "" here, and production-only settings
// can't leak into staging.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "./env-file.mjs";

if (process.argv[2] === "--staging") {
  process.env.ENV_FILE = ".env.staging.local";
  process.argv.splice(2, 1);
}

const { name, staging } = loadEnv();
if (staging) {
  const local = resolve(import.meta.dirname, "../.env.local");
  if (existsSync(local)) {
    for (const line of readFileSync(local, "utf8").split(/\r?\n/)) {
      const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
      if (key && process.env[key] === undefined) process.env[key] = "";
    }
  }
}
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: node scripts/with-env.mjs <command> [args...]");
  process.exit(2);
}
console.error(`[env] ${name}${staging ? " (staging)" : ""}`);
// node runs directly (arguments arrive untouched); other commands (npx, next) need the shell on Windows,
// so their arguments are quoted for it
const r =
  cmd === "node"
    ? spawnSync(process.execPath, args, { stdio: "inherit", env: process.env })
    : spawnSync(cmd, args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)), { stdio: "inherit", shell: true, env: process.env });
process.exit(r.status ?? 1);
