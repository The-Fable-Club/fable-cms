import * as XLSX from "xlsx";

export const REG_NO_REGEX = /^\d{2}[A-Za-z]{3}\d{4,5}$/;

export type ParsedAttendee = {
  reg_no: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  year: string | null;
  college: string | null;
  college_type: string | null;
  payment_status: string | null;
  team_id: string | null;
};

export type ParseResult =
  | { ok: true; attendees: ParsedAttendee[]; totalRows: number; skippedRows: number }
  | { ok: false; error: string };

function cleanKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELD_MAP: Record<string, keyof ParsedAttendee> = {
  id: "reg_no",
  regno: "reg_no",
  registrationnumber: "reg_no",
  registrationno: "reg_no",
  regnumber: "reg_no",
  applicationno: "reg_no",
  name: "name",
  studentname: "name",
  fullname: "name",
  email: "email",
  emailid: "email",
  studentemail: "email",
  phno: "phone",
  phone: "phone",
  phonenumber: "phone",
  mobileno: "phone",
  mobile: "phone",
  department: "department",
  dept: "department",
  branch: "department",
  programme: "department",
  year: "year",
  academicyear: "year",
  college: "college",
  collegename: "college",
  institution: "college",
  collegetype: "college_type",
  paymentstatus: "payment_status",
  payment: "payment_status",
  teamid: "team_id",
  team: "team_id",
};

/**
 * Parses an EventHub attendee spreadsheet (.xlsx, .csv, .ods, .xls).
 * Handles:
 * - EventHub's "Id" column header for registration numbers
 * - Summary/total rows at the bottom (e.g. "Total Income", "Total Paid Count")
 * - Case-insensitive header matching
 * - Sanitization to uppercase registration numbers
 */
export function parseRosterFile(bufferOrString: Buffer | Uint8Array | string): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    if (typeof bufferOrString === "string") {
      workbook = XLSX.read(bufferOrString, { type: "string", raw: false });
    } else {
      workbook = XLSX.read(bufferOrString, { type: "buffer", raw: false });
    }
  } catch (err) {
    return { ok: false, error: `Could not read spreadsheet: ${err instanceof Error ? err.message : String(err)}` };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { ok: false, error: "Spreadsheet contains no sheets." };
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return { ok: false, error: "First sheet is empty." };
  }

  // Read as 2D array of string values
  const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, raw: false, defval: "" });
  if (rows.length === 0) {
    return { ok: false, error: "The spreadsheet is empty." };
  }

  // Find header row: look for row containing 'id', 'reg_no', 'reg no', or 'name'
  let headerRowIdx = -1;
  let colIndexMap = new Map<number, keyof ParsedAttendee>();

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    const candidateMap = new Map<number, keyof ParsedAttendee>();
    let hasRegCol = false;
    let hasNameCol = false;

    row.forEach((cellVal, colIdx) => {
      const key = cleanKey(String(cellVal || ""));
      const mapped = FIELD_MAP[key];
      if (mapped) {
        candidateMap.set(colIdx, mapped);
        if (mapped === "reg_no") hasRegCol = true;
        if (mapped === "name") hasNameCol = true;
      }
    });

    if (hasRegCol || (hasNameCol && candidateMap.size >= 2)) {
      headerRowIdx = r;
      colIndexMap = candidateMap;
      break;
    }
  }

  // If no recognized header found, assume standard default column order: Col 0 = reg_no, Col 1 = name
  if (headerRowIdx === -1) {
    headerRowIdx = 0;
    colIndexMap.set(0, "reg_no");
    colIndexMap.set(1, "name");
  }

  const attendees: ParsedAttendee[] = [];
  const seenRegs = new Set<string>();
  let skippedRows = 0;

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const record: Partial<ParsedAttendee> = {};
    colIndexMap.forEach((field, colIdx) => {
      const val = row[colIdx];
      if (val !== undefined && val !== null) {
        record[field] = String(val).trim();
      }
    });

    const rawReg = (record.reg_no || "").trim().toUpperCase();

    // Verify valid registration number format (skips summary lines like "Total Income")
    if (!REG_NO_REGEX.test(rawReg)) {
      skippedRows++;
      continue;
    }

    if (seenRegs.has(rawReg)) {
      // Duplicate in same file: update details if richer, but don't duplicate
      continue;
    }
    seenRegs.add(rawReg);

    const email = record.email ? record.email.toLowerCase() : null;
    const phone = record.phone ? record.phone.replace(/[^0-9+]/g, "") : null;
    const name = record.name ? record.name.trim() : rawReg;

    attendees.push({
      reg_no: rawReg,
      name,
      email: email || null,
      phone: phone || null,
      department: record.department || null,
      year: record.year || null,
      college: record.college || null,
      college_type: record.college_type || null,
      payment_status: record.payment_status || null,
      team_id: record.team_id || null,
    });
  }

  return {
    ok: true,
    attendees,
    totalRows: rows.length - (headerRowIdx + 1),
    skippedRows,
  };
}
