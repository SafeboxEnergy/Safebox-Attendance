import { describe, it, expect } from "vitest";
import { rowsToCsv, escapeCsvCell } from "@/lib/reports/csv";

describe("rowsToCsv", () => {
  const rows = [
    { name: "Ada Early", status: "EARLY" },
    { name: "Bola OnTime", status: "ON_TIME" },
  ];

  it("renders just the table when no summary is given", () => {
    const csv = rowsToCsv(rows);
    expect(csv).toBe('name,status\nAda Early,EARLY\nBola OnTime,ON_TIME');
  });

  it("prepends a Summary block, blank line, then the table when summary lines are given", () => {
    const csv = rowsToCsv(rows, ["Early arrivals: 1 · On-time arrivals: 1"]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Summary");
    expect(lines[1]).toContain("Early arrivals: 1");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("name,status");
    expect(lines[4]).toBe("Ada Early,EARLY");
  });

  it("quotes a summary line containing a comma", () => {
    const csv = rowsToCsv(rows, ["Top performers: Ada, Bola"]);
    expect(csv.split("\n")[1]).toBe('"Top performers: Ada, Bola"');
  });

  it("still shows the summary even when there are no data rows", () => {
    const csv = rowsToCsv([], ["Early arrivals: 0"]);
    expect(csv).toBe("Summary\nEarly arrivals: 0\n");
  });

  it("returns an empty string when there is neither data nor a summary", () => {
    expect(rowsToCsv([])).toBe("");
  });
});

describe("escapeCsvCell — spreadsheet formula injection", () => {
  it.each([
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
    ["+cmd|'/c calc'!A1", "'+cmd|'/c calc'!A1"],
    ["-1+1+cmd|'/c calc'!A1", "'-1+1+cmd|'/c calc'!A1"],
    ["@SUM(1+1)*cmd|'/c calc'!A1", "'@SUM(1+1)*cmd|'/c calc'!A1"],
    ["\tcmd", "'\tcmd"],
  ])("neutralizes %j with a leading apostrophe", (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it("leaves plain numbers numeric so numeric columns still sum", () => {
    expect(escapeCsvCell(-5)).toBe("-5");
    expect(escapeCsvCell("-5")).toBe("-5");
    expect(escapeCsvCell("+12.5")).toBe("+12.5");
    expect(escapeCsvCell("-1.2e3")).toBe("-1.2e3");
  });

  it("leaves ordinary report values untouched", () => {
    expect(escapeCsvCell("Ada Early")).toBe("Ada Early");
    expect(escapeCsvCell("2026-11-10")).toBe("2026-11-10");
    expect(escapeCsvCell("9:05 AM")).toBe("9:05 AM");
    expect(escapeCsvCell(null)).toBe("");
  });

  it("quotes as well as guards when the value also contains a comma", () => {
    expect(escapeCsvCell("=1,2")).toBe("\"'=1,2\"");
  });

  it("guards an employee-written task description inside a full export", () => {
    const csv = rowsToCsv([{ Task: "=HYPERLINK(\"http://evil\",\"payslip\")" }]);
    expect(csv.split("\n")[1]).toBe("\"'=HYPERLINK(\"\"http://evil\"\",\"\"payslip\"\")\"");
  });
});
