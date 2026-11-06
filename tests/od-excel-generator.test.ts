import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  groupStudentsIntoOdColumns,
  generateOdExcelWorkbook,
  type StudentOdEntry,
} from "@/lib/od-excel-generator";

describe("groupStudentsIntoOdColumns", () => {
  it("places students with all 6 slots into fullDay only", () => {
    const students: StudentOdEntry[] = [
      {
        reg_no: "24BCE1001",
        od_slots: ["slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6"],
      },
    ];

    const grouped = groupStudentsIntoOdColumns(students);
    expect(grouped.fullDay).toEqual(["24BCE1001"]);
    expect(grouped.halfDay1).toEqual([]);
    expect(grouped.halfDay2).toEqual([]);
    expect(grouped.slot1).toEqual([]);
    expect(grouped.slot2).toEqual([]);
    expect(grouped.slot3).toEqual([]);
    expect(grouped.slot4).toEqual([]);
    expect(grouped.slot5).toEqual([]);
    expect(grouped.slot6).toEqual([]);
  });

  it("places students with slots 1, 2, 3 into halfDay1 only", () => {
    const students: StudentOdEntry[] = [
      {
        reg_no: "24BCE1002",
        od_slots: ["slot_1", "slot_2", "slot_3"],
      },
    ];

    const grouped = groupStudentsIntoOdColumns(students);
    expect(grouped.halfDay1).toEqual(["24BCE1002"]);
    expect(grouped.fullDay).toEqual([]);
    expect(grouped.slot1).toEqual([]);
    expect(grouped.slot2).toEqual([]);
    expect(grouped.slot3).toEqual([]);
  });

  it("places students with slots 4, 5, 6 into halfDay2 only", () => {
    const students: StudentOdEntry[] = [
      {
        reg_no: "24BCE1003",
        od_slots: ["slot_4", "slot_5", "slot_6"],
      },
    ];

    const grouped = groupStudentsIntoOdColumns(students);
    expect(grouped.halfDay2).toEqual(["24BCE1003"]);
    expect(grouped.fullDay).toEqual([]);
    expect(grouped.slot4).toEqual([]);
    expect(grouped.slot5).toEqual([]);
    expect(grouped.slot6).toEqual([]);
  });

  it("handles partial slots correctly without duplicates", () => {
    const students: StudentOdEntry[] = [
      // Morning half-day + single afternoon slot
      {
        reg_no: "24BCE1004",
        od_slots: ["slot_1", "slot_2", "slot_3", "slot_4"],
      },
      // Individual partial slots (not full morning half)
      {
        reg_no: "24BCE1005",
        od_slots: ["slot_1", "slot_2"],
      },
      // Individual afternoon slot
      {
        reg_no: "24BCE1006",
        od_slots: ["slot_5"],
      },
    ];

    const grouped = groupStudentsIntoOdColumns(students);
    expect(grouped.halfDay1).toEqual(["24BCE1004"]);
    expect(grouped.slot4).toEqual(["24BCE1004"]);
    expect(grouped.slot1).toEqual(["24BCE1005"]);
    expect(grouped.slot2).toEqual(["24BCE1005"]);
    expect(grouped.slot3).toEqual([]);
    expect(grouped.slot5).toEqual(["24BCE1006"]);
  });

  it("normalizes human time string slot codes and inherits default slots if unassigned", () => {
    const students: StudentOdEntry[] = [
      // Given as human time codes
      {
        reg_no: "24BCE1078",
        od_slots: ["8:00 AM - 9:40 AM", "9:50 AM - 11:30 AM", "11:40 AM - 1:30 PM"],
      },
      // Student with empty slots inheriting event defaults (slots 1, 2)
      {
        reg_no: "24BAI1599",
        od_slots: [],
      },
    ];

    const grouped = groupStudentsIntoOdColumns(students, ["slot_1", "slot_2"]);
    // 24BCE1078 has all 3 morning slots
    expect(grouped.halfDay1).toEqual(["24BCE1078"]);
    // 24BAI1599 inherits event slots 1 & 2
    expect(grouped.slot1).toEqual(["24BAI1599"]);
    expect(grouped.slot2).toEqual(["24BAI1599"]);
  });
});

describe("generateOdExcelWorkbook", () => {
  it("generates an Excel file with exact headers, yellow fills, merges, and student rows", async () => {
    const sampleStudents: StudentOdEntry[] = [
      {
        reg_no: "24BCE1078",
        od_slots: ["slot_1", "slot_2", "slot_3"], // Morning half
      },
      {
        reg_no: "24BAI1599",
        od_slots: ["slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6"], // Full day
      },
      {
        reg_no: "23BCE5109",
        od_slots: ["slot_1"], // Individual slot 1
      },
    ];

    const buffer = await generateOdExcelWorkbook("06/11/2026", sampleStudents);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // Read back and verify sheet anatomy
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet(1);
    expect(ws).toBeDefined();

    // Check Row 2 merge & title
    expect(ws!.getCell("A2").value).toBe("Attendance Compensation");

    // Check Row 3 instruction
    expect(String(ws!.getCell("A3").value)).toContain("minimum of two hours");

    // Check Row 4 yellow header styles
    const a4 = ws!.getCell("A4");
    expect(a4.value).toBe("SL.NO");
    const a4Fill = a4.fill as any;
    expect(a4Fill.type).toBe("pattern");
    expect(a4Fill.pattern).toBe("solid");
    expect(a4Fill.fgColor?.argb).toBe("FFFFFF00");

    const c4 = ws!.getCell("C4");
    expect(String(c4.value)).toContain("HALF DAY");
    expect(c4.font?.bold).toBe(true);

    // Check Row 5 (First student row)
    const row5 = ws!.getRow(5);
    expect(row5.getCell(1).value).toBe(1); // SL.NO
    expect(row5.getCell(2).value).toBe("06/11/2026"); // DATE

    // Col C (Col 3) should have 24BCE1078 (Morning half)
    expect(row5.getCell(3).value).toBe("24BCE1078");
    // Col E (Col 5) should have 24BAI1599 (Full day)
    expect(row5.getCell(5).value).toBe("24BAI1599");
    // Col F (Col 6) should have 23BCE5109 (Slot 1)
    expect(row5.getCell(6).value).toBe("23BCE5109");

    // Check styling on data cell
    const cellC5 = row5.getCell(3);
    expect(cellC5.font?.name).toBe("Calibri");
    expect(cellC5.border?.top?.style).toBe("thin");
    expect(cellC5.border?.bottom?.style).toBe("thin");
  });
});
