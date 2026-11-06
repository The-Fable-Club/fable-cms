import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseRosterFile, REG_NO_REGEX } from "@/lib/roster-parser";

describe("parseRosterFile with Event_Details.ods", () => {
  const odsPath = resolve(process.cwd(), "../Event_Details.ods");

  it("successfully parses the real Event_Details.ods file", () => {
    const buffer = readFileSync(odsPath);
    const result = parseRosterFile(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Must extract exactly 2 valid students: Sam and Josh
    expect(result.attendees).toHaveLength(2);

    const sam = result.attendees.find((a) => a.reg_no === "24BLC1208");
    expect(sam).toBeDefined();
    expect(sam).toMatchObject({
      reg_no: "24BLC1208",
      name: "Sam",
      email: "sam@vitstudent.ac.in",
      phone: "1234567890",
      college: "VIT-CHENNAI",
      payment_status: "FreeEvent",
      college_type: "Internal",
      team_id: "1327",
    });

    const josh = result.attendees.find((a) => a.reg_no === "26BAI1722");
    expect(josh).toBeDefined();
    expect(josh).toMatchObject({
      reg_no: "26BAI1722",
      name: "Josh",
      email: "josh@vitstudent.ac.in",
      phone: "2345678901",
      college: "VIT-CHENNAI",
      payment_status: "FreeEvent",
      college_type: "Internal",
      team_id: "53681",
    });

    // Verify summary rows ('Total Income', 'Total Paid Count') were skipped
    expect(result.skippedRows).toBeGreaterThanOrEqual(2);
    expect(result.attendees.some((a) => a.reg_no.includes("TOTAL"))).toBe(false);
  });
});

describe("parseRosterFile with .xlsx and .csv variations", () => {
  it("parses an in-memory .xlsx workbook with EventHub column headers", () => {
    const data = [
      ["Id", "Name", "Email", "Ph_No", "College", "Payment Status", "College Type", "Team Id"],
      ["24BCE1078", "Karthik Raman", "karthik.raman@vitstudent.ac.in", "+91 9876543210", "VIT-CHENNAI", "Paid", "Internal", "42"],
      ["25BAI1599", "Diya Patel", "DIYA.PATEL@VITSTUDENT.AC.IN", "9876543211", "VIT-CHENNAI", "Paid", "Internal", "42"],
      ["Total Income", "500"],
      ["Total Paid Count", "2"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Event_Details");
    const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseRosterFile(xlsxBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.attendees).toHaveLength(2);
    expect(result.attendees[0].reg_no).toBe("24BCE1078");
    expect(result.attendees[0].email).toBe("karthik.raman@vitstudent.ac.in");
    expect(result.attendees[1].reg_no).toBe("25BAI1599");
    expect(result.attendees[1].email).toBe("diya.patel@vitstudent.ac.in");
    expect(result.skippedRows).toBe(2);
  });

  it("parses CSV with alternative header names (Registration Number, Student Name)", () => {
    const csv = `Registration Number,Student Name,Email Address,Mobile Number,Department
24bce1448,Anand Kumar,anand@vitstudent.ac.in,9876500000,SCOPE
24bce1490,Priya Singh,priya@vitstudent.ac.in,9876500001,SCOPE
Total Count,2
`;

    const result = parseRosterFile(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.attendees).toHaveLength(2);
    expect(result.attendees[0].reg_no).toBe("24BCE1448");
    expect(result.attendees[0].name).toBe("Anand Kumar");
    expect(result.attendees[1].reg_no).toBe("24BCE1490");
    expect(result.attendees[1].name).toBe("Priya Singh");
  });

  it("handles duplicate registration numbers in the same file gracefully", () => {
    const csv = `Id,Name,Email
24BAI1075,First Occurrence,first@vitstudent.ac.in
24BAI1075,Duplicate Entry,dup@vitstudent.ac.in
`;
    const result = parseRosterFile(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.attendees).toHaveLength(1);
    expect(result.attendees[0].name).toBe("First Occurrence");
  });
});

describe("REG_NO_REGEX format validation", () => {
  it("validates 9-character and 10-character VIT registration numbers", () => {
    expect(REG_NO_REGEX.test("24BAI1075")).toBe(true);
    expect(REG_NO_REGEX.test("26BAI1722")).toBe(true);
    expect(REG_NO_REGEX.test("24BLC1208")).toBe(true);
    expect(REG_NO_REGEX.test("24BCE10789")).toBe(true);
  });

  it("rejects non-registration strings like headers or summaries", () => {
    expect(REG_NO_REGEX.test("Total Income")).toBe(false);
    expect(REG_NO_REGEX.test("Total Paid Count")).toBe(false);
    expect(REG_NO_REGEX.test("Id")).toBe(false);
    expect(REG_NO_REGEX.test("")).toBe(false);
  });
});
