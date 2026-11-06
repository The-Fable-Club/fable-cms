import { createHash } from "node:crypto";

export const STEP_SECONDS = 20;

/**
 * Computes a 6-digit rolling OTP code for a checkpoint secret and timestamp.
 * Matches the PostgreSQL stored procedure formula exactly.
 */
export function computeRollingCode(secret: string, timestampMs = Date.now()): { code: string; step: number; secondsRemaining: number } {
  const epochSeconds = Math.floor(timestampMs / 1000);
  const step = Math.floor(epochSeconds / STEP_SECONDS);
  const secondsRemaining = STEP_SECONDS - (epochSeconds % STEP_SECONDS);

  const hash = createHash("md5")
    .update(`${secret}:${step}`)
    .digest("hex");

  const num = parseInt(hash.slice(0, 8), 16) % 1_000_000;
  const code = String(num).padStart(6, "0");

  return { code, step, secondsRemaining };
}

/**
 * Validates a submitted code against the current and previous 20s window.
 * Allows 1-step drift (20-40 seconds total window) to accommodate network delay.
 */
export function verifyRollingCode(secret: string, inputCode: string, timestampMs = Date.now()): boolean {
  const clean = inputCode.trim();
  if (!/^\d{6}$/.test(clean)) return false;

  const epochSeconds = Math.floor(timestampMs / 1000);
  const currentStep = Math.floor(epochSeconds / STEP_SECONDS);

  for (const step of [currentStep, currentStep - 1]) {
    const hash = createHash("md5")
      .update(`${secret}:${step}`)
      .digest("hex");
    const num = parseInt(hash.slice(0, 8), 16) % 1_000_000;
    const expected = String(num).padStart(6, "0");
    if (clean === expected) return true;
  }

  return false;
}
