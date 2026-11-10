/**
 * Spreadsheet formula-injection guard.
 *
 * Excel, LibreOffice and Sheets evaluate a cell whose text starts with one of
 * these characters, and a crafted value can reach DDE/command execution
 * ("=cmd|'/c calc'!A1", "+cmd|...", "-1+1+cmd|...", "@SUM(1+1)*cmd|..."). Task
 * descriptions and early-clock-out reasons in these exports are typed by
 * employees, so an export opened by an admin is an attacker-reachable sink.
 * Prefixing an apostrophe makes the spreadsheet treat the cell as literal text.
 *
 * Only the CSV path needs this: the .xlsx writer (lib/reports/excel.ts,
 * lib/reports/taskExport.ts) stores these values as typed string cells, which
 * spreadsheets never evaluate as formulas.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** A plain number keeps its sign, so "-5" stays numeric and numeric columns still sum. */
const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function needsFormulaGuard(str: string): boolean {
  return FORMULA_LEAD.test(str) && !PLAIN_NUMBER.test(str.trim());
}

/** Quotes/escapes one CSV cell, neutralizing a leading formula character first. */
export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  const guarded = needsFormulaGuard(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export function rowsToCsv<T extends object>(rows: T[], summaryLines?: string[]): string {
  const lines: string[] = [];

  if (summaryLines?.length) {
    lines.push("Summary");
    for (const line of summaryLines) lines.push(escapeCsvCell(line));
    lines.push("");
  }

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]!);
    lines.push(headers.join(","));
    for (const row of rows) {
      lines.push(headers.map((h) => escapeCsvCell((row as Record<string, unknown>)[h])).join(","));
    }
  }

  return lines.join("\n");
}
