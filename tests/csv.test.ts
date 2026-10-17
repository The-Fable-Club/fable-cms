import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("writes a header and rows, with a BOM and CRLF", () => {
    expect(toCsv(["a", "b"], [{ a: 1, b: "x" }])).toBe("﻿a,b\r\n1,x\r\n");
  });
  it("quotes commas, quotes and newlines", () => {
    const out = toCsv(["t"], [{ t: 'say "hi", ok' }, { t: "two\nlines" }]);
    expect(out).toContain('"say ""hi"", ok"');
    expect(out).toContain('"two\nlines"');
  });
  it("neutralises spreadsheet formulas", () => {
    const out = toCsv(["t"], [{ t: "=HYPERLINK(\"http://evil\")" }, { t: "+1" }, { t: "-1" }, { t: "@x" }]);
    expect(out).not.toMatch(/\r\n=/);
    expect(out).toContain("'+1");
    expect(out).toContain("'@x");
  });
  it("handles null, missing and object values", () => {
    expect(toCsv(["a", "b", "c"], [{ a: null, c: { k: 1 } }])).toBe('﻿a,b,c\r\n,,"{""k"":1}"\r\n');
  });
});
