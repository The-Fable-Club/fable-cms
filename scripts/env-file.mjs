// Which settings file the scripts and live tests use: .env.local (production) by default,
// or another file named by ENV_FILE, e.g. ENV_FILE=.env.staging.local for the staging project.
// A staging file that points at the production project is refused, so a mix-up can't turn
// a staging run (attack tests, floods, seeding) loose on real data.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const PRODUCTION_REF = "cvfwkrhldhtkydisduey";
const ROOT = resolve(import.meta.dirname, "..");

/** Loads the chosen file into process.env and says which one it was. */
export function loadEnv() {
  const name = process.env.ENV_FILE?.trim() || ".env.local";
  const file = resolve(ROOT, name);
  if (existsSync(file)) process.loadEnvFile(file);
  const staging = /staging/i.test(name);
  if (staging) {
    const targets = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.DATABASE_URL].filter(Boolean).join(" ");
    if (targets.includes(PRODUCTION_REF)) {
      throw new Error(`${name} points at the PRODUCTION Supabase project; refusing to run a staging command against it.`);
    }
  }
  return { name, file, staging };
}
