import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRosterFile } from "../src/lib/roster-parser";
import {
  computeRollingCode,
  verifyRollingCode,
} from "../src/lib/attendance-crypto";

describe("Attendance System End-to-End Workflow Simulation", () => {
  const sampleOdsPath = join(process.cwd(), "..", "Event_Details.ods");
  const odsBuffer = readFileSync(sampleOdsPath);

  it("1. Imports roster from EventHub spreadsheet correctly", () => {
    const parseResult = parseRosterFile(odsBuffer);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    // Must correctly filter summary rows and extract student registrations
    expect(parseResult.attendees.length).toBe(2);

    const sam = parseResult.attendees.find((a) => a.reg_no === "24BLC1208");
    expect(sam).toBeDefined();
    expect(sam?.name).toBe("Sam");
    expect(sam?.phone).toBe("1234567890");

    const josh = parseResult.attendees.find((a) => a.reg_no === "26BAI1722");
    expect(josh).toBeDefined();
    expect(josh?.name).toBe("Josh");
    expect(josh?.phone).toBe("2345678901");
  });

  it("2. Simulates 20s rolling OTP Presenter Screen & Verification with Drift", () => {
    const secret = "test-secret-checkpoint-arrival";
    const t0Ms = 1730000000 * 1000; // Fixed timestamp in ms

    // Presenter screen generates 6-digit code for current 20s epoch step
    const { code: code0, step: step0, secondsRemaining } = computeRollingCode(secret, t0Ms);
    expect(code0).toMatch(/^\d{6}$/);
    expect(secondsRemaining).toBeGreaterThanOrEqual(1);
    expect(secondsRemaining).toBeLessThanOrEqual(20);

    // Within same 20s window (e.g. 5 seconds later), same code is generated
    const { code: code0Plus5 } = computeRollingCode(secret, t0Ms + 5000);
    expect(code0Plus5).toBe(code0);

    // After 21 seconds (next step), code rolls forward
    const { code: code1, step: step1 } = computeRollingCode(secret, t0Ms + 21000);
    expect(step1).toBe(step0 + 1);
    expect(code1).not.toBe(code0);

    // Code verification accepts current code
    expect(verifyRollingCode(secret, code0, t0Ms)).toBe(true);

    // 1-step drift acceptance: code from previous 20s step is accepted during the next step
    expect(verifyRollingCode(secret, code0, t0Ms + 21000)).toBe(true);

    // Stale code from 2 steps ago (45s later) is rejected
    expect(verifyRollingCode(secret, code0, t0Ms + 45000)).toBe(false);

    // Arbitrary wrong code is rejected
    expect(verifyRollingCode(secret, "999999", t0Ms)).toBe(false);
  });

  it("3. Simulates Anti-Proxy 1-Device Binding and Multiple Students", () => {
    // In-memory model mimicking PostgreSQL table constraints and atomic locks
    type RosterRecord = {
      id: number;
      reg_no: string;
      device_token: string | null;
    };
    type MarkRecord = {
      roster_id: number;
      checkpoint_id: number;
      method: "student_code" | "volunteer_scan";
    };

    const roster: RosterRecord[] = [
      { id: 1, reg_no: "24BLC1208", device_token: null },
      { id: 2, reg_no: "26BAI1722", device_token: null },
    ];
    const marks: MarkRecord[] = [];

    function markAttendance(
      regNo: string,
      code: string,
      deviceToken: string,
      checkpointId: number,
      secret: string,
      timestampMs: number
    ): { ok: boolean; code?: string; message: string } {
      const student = roster.find((r) => r.reg_no === regNo);
      if (!student) return { ok: false, code: "not_in_roster", message: "Not in roster" };

      if (!verifyRollingCode(secret, code, timestampMs)) {
        return { ok: false, code: "invalid_code", message: "Invalid or expired code" };
      }

      // 1. Anti-Proxy: Check if device is already registered to someone else in this event
      const deviceUsedByOther = roster.some(
        (r) => r.device_token === deviceToken && r.id !== student.id
      );
      if (deviceUsedByOther) {
        return { ok: false, code: "device_shared", message: "Device already used by another student" };
      }

      // 2. Enforce 1-device binding for this student
      if (student.device_token === null) {
        student.device_token = deviceToken;
      } else if (student.device_token !== deviceToken) {
        return { ok: false, code: "device_mismatch", message: "Registration bound to another device" };
      }

      // 3. Check if already marked
      if (marks.some((m) => m.roster_id === student.id && m.checkpoint_id === checkpointId)) {
        return { ok: false, code: "already_marked", message: "Already checked in" };
      }

      marks.push({ roster_id: student.id, checkpoint_id: checkpointId, method: "student_code" });
      return { ok: true, message: "Marked present" };
    }

    const secret = "chk-1-secret";
    const nowMs = 1730000000 * 1000;
    const { code } = computeRollingCode(secret, nowMs);

    // Student 1 marks attendance with Device A -> SUCCESS (binds Device A)
    const res1 = markAttendance("24BLC1208", code, "device-A-uuid", 1, secret, nowMs);
    expect(res1.ok).toBe(true);
    expect(roster[0].device_token).toBe("device-A-uuid");

    // Student 1 tries to mark same checkpoint again -> REJECTED (already marked)
    const resDuplicate = markAttendance("24BLC1208", code, "device-A-uuid", 1, secret, nowMs);
    expect(resDuplicate.code).toBe("already_marked");

    // Student 1 tries from a friend's phone Device B -> REJECTED (device mismatch)
    const resMismatch = markAttendance("24BLC1208", code, "device-B-uuid", 2, secret, nowMs);
    expect(resMismatch.code).toBe("device_mismatch");

    // Student 2 tries to proxy-mark using Student 1's phone Device A -> REJECTED (device shared)
    const resShared = markAttendance("26BAI1722", code, "device-A-uuid", 1, secret, nowMs);
    expect(resShared.code).toBe("device_shared");

    // Student 2's device was NOT bound to Device A because the device_shared check aborted before binding
    expect(roster[1].device_token).toBeNull();

    // Student 2 marks with their own phone Device C -> SUCCESS
    const res2 = markAttendance("26BAI1722", code, "device-C-uuid", 1, secret, nowMs);
    expect(res2.ok).toBe(true);
    expect(roster[1].device_token).toBe("device-C-uuid");
  });

  it("4. Simulates Volunteer Door ID Scan and OD Eligibility Rule", () => {
    // Checkpoints: Arrival (needed for OD), Exit (needed for OD)
    const checkpoints = [
      { id: 1, title: "Arrival", needed_for_od: true },
      { id: 2, title: "Exit", needed_for_od: true },
    ];

    type Mark = { roster_id: number; checkpoint_id: number; method: string; verified_by?: string };

    const marks: Mark[] = [
      // Student 1 (id: 1) has both checkpoints AND volunteer scan
      { roster_id: 1, checkpoint_id: 1, method: "student_code" },
      { roster_id: 1, checkpoint_id: 2, method: "student_code" },
      { roster_id: 1, checkpoint_id: 1, method: "volunteer_scan", verified_by: "volunteer1" },

      // Student 2 (id: 2) has both checkpoints, but NO volunteer scan
      { roster_id: 2, checkpoint_id: 1, method: "student_code" },
      { roster_id: 2, checkpoint_id: 2, method: "student_code" },

      // Student 3 (id: 3) has volunteer scan, but missed Exit checkpoint
      { roster_id: 3, checkpoint_id: 1, method: "student_code" },
      { roster_id: 3, checkpoint_id: 1, method: "volunteer_scan", verified_by: "volunteer1" },
    ];

    function isEligibleForOd(rosterId: number): boolean {
      const studentMarks = marks.filter((m) => m.roster_id === rosterId);
      const hasDoorScan = studentMarks.some(
        (m) => m.method === "volunteer_scan" || m.verified_by
      );
      if (!hasDoorScan) return false;

      const reqCheckpoints = checkpoints.filter((c) => c.needed_for_od);
      const metAllReq = reqCheckpoints.every((rc) =>
        studentMarks.some((m) => m.checkpoint_id === rc.id)
      );
      return metAllReq;
    }

    expect(isEligibleForOd(1)).toBe(true);  // Met all checkpoints + door scan
    expect(isEligibleForOd(2)).toBe(false); // Met checkpoints but missed physical door scan
    expect(isEligibleForOd(3)).toBe(false); // Had door scan but missed required checkpoint
  });
});
