import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guard";
import { fetchTaskReportDetails, fetchTaskReportRows, summarizeTaskReportRows } from "@/lib/reports/query";
import { taskReportsToCsv, taskReportsToExcelBuffer } from "@/lib/reports/taskExport";
import { generateTaskReportPdf } from "@/lib/reports/taskPdf";
import { getCompanySettings } from "@/lib/company/settings";
import { getAttendanceSettings } from "@/lib/attendance/settings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let user;
  try {
    // Task reports are narrower than the other reports — Admin and Super Admin only.
    user = await requirePermission("taskReports", "view");
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: (err as { status?: number }).status ?? 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "csv";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const settings = await getAttendanceSettings();

  const filters = {
    from: from || undefined,
    to: to || undefined,
    officeId: searchParams.get("officeId") || undefined,
    status: searchParams.get("status") || undefined,
  };
  const [rows, reports] = await Promise.all([
    fetchTaskReportRows(filters, settings.timezone),
    fetchTaskReportDetails(filters, settings.timezone),
  ]);
  const summaryLines = summarizeTaskReportRows(rows);

  if (format === "xlsx") {
    const buffer = await taskReportsToExcelBuffer(reports, summaryLines);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=task-reports.xlsx",
      },
    });
  }

  if (format === "pdf") {
    const company = await getCompanySettings();
    const range = from && to && from === to ? from : `${from || "All dates"} to ${to || "present"}`;
    const buffer = await generateTaskReportPdf({
      companyName: company.companyName,
      logoUrl: company.logoUrl,
      title: "Daily Task Report",
      subtitle: range,
      generatedBy: user.fullName,
      summaryLines,
      reports,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=task-reports.pdf" },
    });
  }

  const csv = taskReportsToCsv(reports, summaryLines);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=task-reports.csv" },
  });
}
