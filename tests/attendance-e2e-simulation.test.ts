import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRosterFile } from "../src/lib/roster-parser";
import { VIT_REG_NO_REGEX } from "../src/lib/od-constants";

import {
  groupStudentsIntoOdColumns,
  generateOdExcelWorkbook,
  type StudentOdEntry,
} from "../src/lib/od-excel-generator";

describe("Staff Attendance & University OD Workflow Simulation", () => {
  const sampleOdsPath = join(__dirname, "fixtures", "sample-roster.ods");
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

  it("2. Validates On-Spot registration numbers conditionally by College", () => {
    function validateOnSpot(regNo: string, collegeInput?: string) {
      const cleanReg = regNo.trim().toUpperCase();
      const college = (collegeInput || "").trim() || "VIT Chennai";
      const isVitChennai = college.toLowerCase() === "vit chennai";

      if (isVitChennai) {
        if (!VIT_REG_NO_REGEX.test(cleanReg)) {
          return { ok: false, error: "VIT format required (2 digits, 3 letters, 4 digits)" };
        }
      } else {
        if (cleanReg.length < 2 || cleanReg.length > 50) {
          return { ok: false, error: "Invalid registration number length" };
        }
      }
      return { ok: true, regNo: cleanReg, college };
    }

    // VIT Chennai (default or explicit): must follow 2 digits, 3 letters, 4 digits
    expect(validateOnSpot("24BCE1078").ok).toBe(true);
    expect(validateOnSpot("24bce1078", "VIT Chennai").ok).toBe(true);
    expect(validateOnSpot("24BCE1078", "vit chennai").ok).toBe(true);
    expect(validateOnSpot("24BCE1078", "").ok).toBe(true);

    // Invalid VIT formats
    expect(validateOnSpot("12345").ok).toBe(false);
    expect(validateOnSpot("24BC1078").ok).toBe(false); // Only 2 letters
    expect(validateOnSpot("24BCE107").ok).toBe(false);  // Only 3 digits at end

    // Non-VIT Colleges: accepts arbitrary institutional ID formats
    expect(validateOnSpot("RA2111003010123", "SRM University").ok).toBe(true);
    expect(validateOnSpot("CS2024-9901", "IIT Madras").ok).toBe(true);
    expect(validateOnSpot("ANNA-ENG-442", "Anna University").ok).toBe(true);
    expect(validateOnSpot("X", "SRM").ok).toBe(false); // Too short (<2)
  });

  it("3. Simulates Staff recording attendance and OD slot customization", () => {
    type RosterRecord = {
      id: number;
      reg_no: string;
      name: string;
      college: string;
      od_slots: string[];
      od_override: boolean;
      od_override_reason?: string;
    };

    type MarkRecord = {
      roster_id: number;
      checkpoint_id: number;
      verified_by: string;
    };

    const roster: RosterRecord[] = [
      {
        id: 1,
        reg_no: "24BCE1078",
        name: "Skandan",
        college: "VIT Chennai",
        od_slots: [],
        od_override: false,
      },
      {
        id: 2,
        reg_no: "24BAI1599",
        name: "Sanjani",
        college: "VIT Chennai",
        od_slots: [],
        od_override: false,
      },
    ];

    const marks: MarkRecord[] = [];

    // Staff records attendance for Skandan at Checkpoint 1 with 3 morning slots
    function staffRecordAttendance(
      rosterId: number,
      checkpointId: number,
      selectedSlots: string[],
      actor: string
    ) {
      const student = roster.find((r) => r.id === rosterId);
      if (!student) return { ok: false, message: "Student not found" };

      // Update OD slots
      student.od_slots = selectedSlots;

      // Add mark if not present
      if (!marks.some((m) => m.roster_id === rosterId && m.checkpoint_id === checkpointId)) {
        marks.push({ roster_id: rosterId, checkpoint_id: checkpointId, verified_by: actor });
      }

      return { ok: true, student };
    }

    const res1 = staffRecordAttendance(1, 101, ["slot_1", "slot_2", "slot_3"], "admin_user");
    expect(res1.ok).toBe(true);
    expect(roster[0].od_slots).toEqual(["slot_1", "slot_2", "slot_3"]);
    expect(marks.length).toBe(1);

    // Staff records attendance for Sanjani at Checkpoint 1 with all 6 slots
    const allSlots = ["slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6"];
    const res2 = staffRecordAttendance(2, 101, allSlots, "admin_user");
    expect(res2.ok).toBe(true);
    expect(roster[1].od_slots).toEqual(allSlots);
    expect(marks.length).toBe(2);
  });

  it("4. Evaluates OD eligibility across checkpoints and supports manual overrides", () => {
    const checkpoints = [
      { id: 1, title: "Arrival Check", needed_for_od: true },
      { id: 2, title: "Exit Check", needed_for_od: true },
      { id: 3, title: "Photo Booth", needed_for_od: false },
    ];

    const requiredIds = checkpoints.filter((c) => c.needed_for_od).map((c) => c.id);

    type StudentState = {
      id: number;
      reg_no: string;
      od_slots: string[];
      od_override: boolean;
      od_override_reason?: string;
      marks: number[];
    };

    const students: StudentState[] = [
      // Attended both required checkpoints -> Eligible
      {
        id: 1,
        reg_no: "24BCE1078",
        od_slots: ["slot_1", "slot_2"],
        od_override: false,
        marks: [1, 2],
      },
      // Missed Exit Check -> Ineligible
      {
        id: 2,
        reg_no: "24BAI1599",
        od_slots: ["slot_1", "slot_2"],
        od_override: false,
        marks: [1],
      },
      // Missed Exit Check but has staff manual override -> Eligible
      {
        id: 3,
        reg_no: "24BEE1002",
        od_slots: ["slot_1", "slot_2", "slot_3"],
        od_override: true,
        od_override_reason: "Participated in organizing setup",
        marks: [1],
      },
    ];

    function evaluateEligibility(s: StudentState) {
      const markSet = new Set(s.marks);
      const missedRequired = requiredIds.filter((reqId) => !markSet.has(reqId));
      const hasAllRequired = missedRequired.length === 0;
      const hasSlots = s.od_slots.length > 0;
      const eligible = s.od_override || (hasAllRequired && hasSlots);

      return {
        eligible,
        missed: missedRequired.map((id) => checkpoints.find((c) => c.id === id)!.title),
        isOverridden: s.od_override,
      };
    }

    const eval1 = evaluateEligibility(students[0]);
    expect(eval1.eligible).toBe(true);

    const eval2 = evaluateEligibility(students[1]);
    expect(eval2.eligible).toBe(false);
    expect(eval2.missed).toEqual(["Exit Check"]);

    const eval3 = evaluateEligibility(students[2]);
    expect(eval3.eligible).toBe(true);
    expect(eval3.isOverridden).toBe(true);
  });

  it("5. Generates official OD Excel file from eligible students", async () => {
    const eligibleStudents: StudentOdEntry[] = [
      { reg_no: "24BCE1078", od_slots: ["slot_1", "slot_2", "slot_3"] },
      {
        reg_no: "24BAI1599",
        od_slots: ["slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6"],
      },
    ];

    const grouped = groupStudentsIntoOdColumns(eligibleStudents);
    expect(grouped.halfDay1).toEqual(["24BCE1078"]);
    expect(grouped.fullDay).toEqual(["24BAI1599"]);

    const buffer = await generateOdExcelWorkbook("06/11/2026", eligibleStudents);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
