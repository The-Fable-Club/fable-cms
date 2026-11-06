import path from "node:path";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { normalizeSlotId } from "@/lib/od-constants";

export type StudentOdEntry = {
  reg_no: string;
  od_slots?: string[] | null;
};

export type OdColumnGroup = {
  halfDay1: string[]; // Col C (Slots 1, 2, 3)
  halfDay2: string[]; // Col D (Slots 4, 5, 6)
  fullDay: string[];  // Col E (Slots 1, 2, 3, 4, 5, 6)
  slot1: string[];    // Col F
  slot2: string[];    // Col G
  slot3: string[];    // Col H
  slot4: string[];    // Col I
  slot5: string[];    // Col J
  slot6: string[];    // Col K
};

/**
 * Group eligible students into respective OD columns following university aggregation rules:
 * - All 6 slots -> FULL DAY column (Col E). Never repeated in half day or individual slots.
 * - Slots 1, 2, 3 -> HALF DAY Morning column (Col C). Never repeated in individual morning slots.
 * - Slots 4, 5, 6 -> HALF DAY Afternoon column (Col D). Never repeated in individual afternoon slots.
 * - Any remaining individual slots -> Respective individual slot columns (Cols F - K).
 */
export function groupStudentsIntoOdColumns(
  students: readonly StudentOdEntry[],
  defaultSlots: readonly string[] = []
): OdColumnGroup {
  const result: OdColumnGroup = {
    halfDay1: [],
    halfDay2: [],
    fullDay: [],
    slot1: [],
    slot2: [],
    slot3: [],
    slot4: [],
    slot5: [],
    slot6: [],
  };

  const ALL_SLOTS = ["slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6"];
  const MORNING_SLOTS = ["slot_1", "slot_2", "slot_3"];
  const AFTERNOON_SLOTS = ["slot_4", "slot_5", "slot_6"];

  const normDefaults = defaultSlots.map(normalizeSlotId).filter(Boolean) as string[];
  const fallbackSlotSet = normDefaults.length > 0 ? normDefaults : ALL_SLOTS;

  for (const student of students) {
    const reg = student.reg_no.trim().toUpperCase();
    if (!reg) continue;

    // Use student's slots if non-empty, otherwise inherit event / default slots
    const rawSlots = Array.isArray(student.od_slots) && student.od_slots.length > 0
      ? student.od_slots
      : fallbackSlotSet;

    const normList = rawSlots.map(normalizeSlotId).filter(Boolean) as string[];
    const slots = new Set(normList.length > 0 ? normList : fallbackSlotSet);

    const hasAll = ALL_SLOTS.every((s) => slots.has(s));
    if (hasAll) {
      result.fullDay.push(reg);
      continue;
    }

    // Morning check
    const hasMorningHalf = MORNING_SLOTS.every((s) => slots.has(s));
    if (hasMorningHalf) {
      result.halfDay1.push(reg);
    } else {
      if (slots.has("slot_1")) result.slot1.push(reg);
      if (slots.has("slot_2")) result.slot2.push(reg);
      if (slots.has("slot_3")) result.slot3.push(reg);
    }

    // Afternoon check
    const hasAfternoonHalf = AFTERNOON_SLOTS.every((s) => slots.has(s));
    if (hasAfternoonHalf) {
      result.halfDay2.push(reg);
    } else {
      if (slots.has("slot_4")) result.slot4.push(reg);
      if (slots.has("slot_5")) result.slot5.push(reg);
      if (slots.has("slot_6")) result.slot6.push(reg);
    }
  }

  return result;
}

const TEMPLATE_HEADERS = [
  "SL.NO",
  "DATE",
  "HALF DAY\r\n8:00 AM TO 1:30 PM",
  "HALF DAY\r\n2:00 AM TO 7:30 PM",
  "FULL DAY\r\n8:00 AM TO 7:30 PM",
  "8:00 PM TO 9:40 AM",
  "09:50  AM TO 11:30 AM",
  "11:40 AM TO 1:30 PM",
  "2:00 PM TO 3:40 PM",
  "3:55 PM TO 5:30 PM",
  "5:30 PM TO 7:30 PM",
  "Remarks",
];

const TEMPLATE_COL_WIDTHS = [
  10.26, // SL.NO
  17.6,  // DATE
  18.0,  // HALF DAY 1
  23.27, // HALF DAY 2
  26.27, // FULL DAY
  23.13, // Slot 1
  26.4,  // Slot 2
  18.27, // Slot 3
  25.86, // Slot 4
  19.73, // Slot 5
  20.0,  // Slot 6
  15.0,  // Remarks
];

/**
 * Builds the official OD workbook matching the exact style of OD FORMAT - Final.xlsx.
 * If the physical template file is available on disk, it is loaded and populated.
 * If not, the identical sheet structure, merges, colors, and styling are generated programmatically.
 */
export async function generateOdExcelWorkbook(
  dateFormatted: string,
  students: readonly StudentOdEntry[],
  defaultSlots: readonly string[] = []
): Promise<Buffer> {
  const grouped = groupStudentsIntoOdColumns(students, defaultSlots);
  const wb = new ExcelJS.Workbook();

  // Template candidate paths
  const templatePath = path.join(process.cwd(), "src/lib/templates/OD_FORMAT_TEMPLATE.xlsx");

  let templateLoaded = false;
  if (fs.existsSync(/*turbopackIgnore: true*/ templatePath)) {
    try {
      await wb.xlsx.readFile(templatePath);
      templateLoaded = true;
    } catch {
      // Fallback to programmatic builder
    }
  }

  let ws: ExcelJS.Worksheet;

  if (templateLoaded) {
    ws = wb.getWorksheet(1)!;
    // Clear old data rows >= 5
    while (ws.rowCount >= 5) {
      ws.spliceRows(5, 1);
    }
  } else {
    // Build from scratch matching OD FORMAT - Final.xlsx
    ws = wb.addWorksheet("Sheet1");

    // Row heights
    ws.getRow(1).height = 77.25;
    ws.getRow(2).height = 21;
    ws.getRow(3).height = 33;
    ws.getRow(4).height = 42.75;

    // Col widths
    TEMPLATE_COL_WIDTHS.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w;
    });

    // Row 2: Attendance Compensation (Merged A2:J2)
    ws.mergeCells("A2:J2");
    const a2 = ws.getCell("A2");
    a2.value = "Attendance Compensation";
    a2.font = { name: "Calibri", size: 14, bold: true };
    a2.alignment = { horizontal: "center", vertical: "middle" };

    // Row 3: Note
    const a3 = ws.getCell("A3");
    a3.value = "Please note that a minimum of two hours is required for processing an OD.";
    a3.font = { name: "Calibri", size: 10, italic: true };
    a3.alignment = { horizontal: "left", vertical: "middle" };

    // Row 4: Yellow Headers
    const row4 = ws.getRow(4);
    TEMPLATE_HEADERS.forEach((headerText, idx) => {
      const cell = row4.getCell(idx + 1);
      cell.value = headerText;
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" }, // Bright yellow
      };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });
    row4.commit();
  }

  // Calculate maximum data rows needed
  const colArrays = [
    grouped.halfDay1,
    grouped.halfDay2,
    grouped.fullDay,
    grouped.slot1,
    grouped.slot2,
    grouped.slot3,
    grouped.slot4,
    grouped.slot5,
    grouped.slot6,
  ];

  const maxRows = Math.max(...colArrays.map((arr) => arr.length), 0);

  // Populate data rows starting at Row 5
  for (let i = 0; i < maxRows; i++) {
    const rowNum = 5 + i;
    const row = ws.getRow(rowNum);
    row.height = 20;

    row.getCell(1).value = i + 1; // SL.NO
    row.getCell(2).value = dateFormatted; // DATE
    row.getCell(3).value = grouped.halfDay1[i] ?? ""; // HALF DAY 1
    row.getCell(4).value = grouped.halfDay2[i] ?? ""; // HALF DAY 2
    row.getCell(5).value = grouped.fullDay[i] ?? ""; // FULL DAY
    row.getCell(6).value = grouped.slot1[i] ?? ""; // Slot 1
    row.getCell(7).value = grouped.slot2[i] ?? ""; // Slot 2
    row.getCell(8).value = grouped.slot3[i] ?? ""; // Slot 3
    row.getCell(9).value = grouped.slot4[i] ?? ""; // Slot 4
    row.getCell(10).value = grouped.slot5[i] ?? ""; // Slot 5
    row.getCell(11).value = grouped.slot6[i] ?? ""; // Slot 6
    row.getCell(12).value = ""; // Remarks

    // Standard styling for each data cell
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }

    row.commit();
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
