import { PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

const prisma = new PrismaClient();
const TZ = "Africa/Lagos";
const f = (d: Date | null) => (d ? formatInTimeZone(d, TZ, "yyyy-MM-dd HH:mm:ss") : "-");

async function main() {
  const settings = await prisma.attendanceSettings.findUnique({ where: { id: "singleton" } });
  console.log("settings:", settings?.timezone, settings?.workStart, settings?.workEnd, settings?.attendanceMode);
  console.log("db now:", await prisma.$queryRaw`select now()::text as now, current_setting('TimeZone') as tz`);
  console.log("server now (Lagos):", f(new Date()));

  const recs = await prisma.attendanceRecord.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 21 * 86_400_000) } },
    orderBy: { clockIn: "asc" },
    select: { id: true, employeeId: true, attendanceDate: true, clockIn: true, clockOut: true, createdAt: true, clockInStatus: true },
  });
  // Afternoon clock-ins (Lagos local hour >= 12) and how they ended.
  const afternoon = recs.filter((r) => r.clockIn && Number(formatInTimeZone(r.clockIn, TZ, "H")) >= 12);
  console.log(`\n${recs.length} records in 21 days, ${afternoon.length} with afternoon clock-in:`);
  for (const r of afternoon) {
    console.log(
      r.employeeId.slice(-6),
      r.attendanceDate.toISOString().slice(0, 10),
      "in", f(r.clockIn), "out", f(r.clockOut), "created", f(r.createdAt), r.clockInStatus
    );
  }
  // Records whose clockIn is in the future, or differs oddly from createdAt (a stored-time bug).
  const odd = recs.filter((r) => r.clockIn && Math.abs(r.clockIn.getTime() - r.createdAt.getTime()) > 60_000);
  console.log(`\n${odd.length} records whose clockIn != createdAt:`);
  for (const r of odd.slice(0, 30)) console.log(r.id, "in", f(r.clockIn), "created", f(r.createdAt));

  // Repeat clock-ins in the audit log.
  const audits = await prisma.auditLog.groupBy({ by: ["action"], _count: true, where: { createdAt: { gte: new Date(Date.now() - 21 * 86_400_000) } } });
  console.log("\naudit actions:", audits);
}

main().finally(() => prisma.$disconnect());
