import ExcelJS from "exceljs";
import type { TaskReportDetail } from "./query";

/** CSV / Excel versions of the task report, laid out like the PDF:
 * Employee Name | Department | Clock In | Clock Out | Task | Status — one line per task,
 * with the employee details shown only on that employee's first task line. */

const HEADERS = ["Date", "Employee Name", "Department", "Clock In", "Clock Out", "Task", "Status"];

const STATUS_FILL: Record<string, { bg: string; fg: string }> = {
  COMPLETED: { bg: "FFD5ECF2", fg: "FF1F5F73" },
  PARTIALLY_COMPLETED: { bg: "FFFBE0DE", fg: "FFA3362D" },
  CARRIED_OVER: { bg: "FFECECEC", fg: "FF3F3F3F" },
};

function taskLines(r: TaskReportDetail) {
  if (r.noTasksReason !== null) return [{ task: `No tasks to report: ${r.noTasksReason}`, status: "", code: "" }];
  if (!r.tasks.length) return [{ task: "", status: "", code: "" }];
  return r.tasks.map((t, i) => ({ task: `${i + 1}. ${t.description}`, status: t.label, code: t.status }));
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function taskReportsToCsv(reports: TaskReportDetail[], summaryLines?: string[]): string {
  const lines: string[] = [];
  if (summaryLines?.length) {
    lines.push("Summary", ...summaryLines.map(escapeCsvCell), "");
  }
  lines.push(HEADERS.join(","));
  for (const r of reports) {
    taskLines(r).forEach((t, i) => {
      const lead = i === 0 ? [r.date, r.employee, r.department, r.clockIn, r.clockOut] : ["", "", "", "", ""];
      lines.push([...lead, t.task, t.status].map(escapeCsvCell).join(","));
    });
  }
  // BOM so Excel opens the CSV as UTF-8 (keeps "—" etc. intact).
  return "\uFEFF" + lines.join("\r\n");
}

export async function taskReportsToExcelBuffer(reports: TaskReportDetail[], summaryLines?: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Task Reports");
  sheet.columns = [{ width: 12 }, { width: 24 }, { width: 20 }, { width: 12 }, { width: 16 }, { width: 60 }, { width: 24 }];

  if (summaryLines?.length) {
    sheet.addRow(["Summary"]).font = { bold: true };
    for (const line of summaryLines) sheet.addRow([line]);
    sheet.addRow([]);
  }

  const border: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } },
  };

  const head = sheet.addRow(HEADERS);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FF374151" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    c.border = border;
    c.alignment = { vertical: "middle" };
  });
  sheet.views = [{ state: "frozen", ySplit: head.number }];

  for (const r of reports) {
    const lines = taskLines(r);
    const first = sheet.rowCount + 1;
    lines.forEach((t, i) => {
      const row = sheet.addRow(i === 0 ? [r.date, r.employee, r.department, r.clockIn, r.clockOut, t.task, t.status] : ["", "", "", "", "", t.task, t.status]);
      row.eachCell({ includeEmpty: true }, (c) => {
        c.border = border;
        c.alignment = { vertical: "top", wrapText: true };
      });
      if (r.noTasksReason !== null) row.getCell(6).font = { italic: true, color: { argb: "FF6B7280" } };
      const colors = STATUS_FILL[t.code];
      if (colors) {
        const s = row.getCell(7);
        s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.bg } };
        s.font = { color: { argb: colors.fg } };
      }
    });
    const last = sheet.rowCount;
    sheet.getCell(first, 2).font = { bold: true };
    // Merge the employee columns down across all of that employee's task lines.
    if (last > first) for (let col = 1; col <= 5; col++) sheet.mergeCells(first, col, last, col);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
