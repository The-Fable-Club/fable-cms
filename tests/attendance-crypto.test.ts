import { describe, expect, it } from "vitest";
import { computeRollingCode, verifyRollingCode, STEP_SECONDS } from "@/lib/attendance-crypto";

describe("attendance-crypto rolling OTP code generation", () => {
  const secret = "f7b8c9d0e1f2a3b4c5d6e7f8";

  it("generates a 6-digit zero-padded numeric string", () => {
    const { code, secondsRemaining } = computeRollingCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(secondsRemaining).toBeGreaterThanOrEqual(1);
    expect(secondsRemaining).toBeLessThanOrEqual(STEP_SECONDS);
  });

  it("yields identical codes within the same 20-second window", () => {
    const base = 1700000000000;
    const c1 = computeRollingCode(secret, base);
    const c2 = computeRollingCode(secret, base + 5000); // 5 seconds later, same step
    expect(c1.step).toBe(c2.step);
    expect(c1.code).toBe(c2.code);
  });

  it("changes code after 20 seconds have elapsed", () => {
    const base = 1700000000000;
    const c1 = computeRollingCode(secret, base);
    const c2 = computeRollingCode(secret, base + 21000); // 21 seconds later, next step
    expect(c1.step).not.toBe(c2.step);
    expect(c1.code).not.toBe(c2.code);
  });

  it("verifies code from the current step", () => {
    const now = 1700000000000;
    const { code } = computeRollingCode(secret, now);
    expect(verifyRollingCode(secret, code, now)).toBe(true);
  });

  it("verifies code from the immediately preceding step (drift tolerance)", () => {
    const t0 = 1700000000000;
    const { code } = computeRollingCode(secret, t0);
    // Verified 25 seconds later (1 step later): should pass due to 1-step drift
    expect(verifyRollingCode(secret, code, t0 + 25000)).toBe(true);
  });

  it("rejects code older than 45 seconds", () => {
    const t0 = 1700000000000;
    const { code } = computeRollingCode(secret, t0);
    // Verified 45 seconds later (2 steps later): must fail
    expect(verifyRollingCode(secret, code, t0 + 45000)).toBe(false);
  });

  it("rejects non-numeric, short, or invalid codes", () => {
    expect(verifyRollingCode(secret, "abc123")).toBe(false);
    expect(verifyRollingCode(secret, "123")).toBe(false);
    expect(verifyRollingCode(secret, "")).toBe(false);
  });
});
