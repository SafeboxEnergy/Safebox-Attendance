import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory stand-in for the attendance_records table, so the real engine's
// clock-in/clock-out state machine can run at any wall-clock time without a DB.
type Rec = Record<string, unknown> & { id: string; employeeId: string; attendanceDate: Date; clockIn: Date | null; clockOut: Date | null };
const records: Rec[] = [];
const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

const EMPLOYEE = {
  id: "emp1",
  firstName: "Ada",
  officeId: "office1",
  isDeleted: false,
  employmentStatus: "ACTIVE",
  workStart: null,
  workEnd: null,
};

vi.mock("@/lib/db/prisma", () => {
  const attendanceRecord = {
    findUnique: async ({ where }: { where: { employeeId_attendanceDate: { employeeId: string; attendanceDate: Date } } }) => {
      const k = where.employeeId_attendanceDate;
      return records.find((r) => r.employeeId === k.employeeId && sameDay(r.attendanceDate, k.attendanceDate)) ?? null;
    },
    findFirst: async ({ where }: { where: { employeeId: string; attendanceDate: { lt: Date }; clockIn: { gte: Date } } }) =>
      records
        .filter(
          (r) =>
            r.employeeId === where.employeeId &&
            !r.clockOut &&
            r.attendanceDate < where.attendanceDate.lt &&
            r.clockIn! >= where.clockIn.gte
        )
        .sort((a, b) => b.clockIn!.getTime() - a.clockIn!.getTime())[0] ?? null,
    create: async ({ data }: { data: Rec }) => {
      const rec = { ...data, id: `rec${records.length + 1}`, clockOut: null } as Rec;
      records.push(rec);
      return rec;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Rec> }) => {
      const rec = records.find((r) => r.id === where.id)!;
      Object.assign(rec, data);
      return rec;
    },
  };
  const prisma = {
    employee: { findUnique: async () => EMPLOYEE },
    holiday: { findUnique: async () => null },
    attendanceRecord,
    dailyTaskReport: { create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { prisma };
});
vi.mock("@/lib/attendance/settings", () => ({
  getAttendanceSettings: async () => ({
    timezone: "Africa/Lagos",
    workStart: "09:00",
    gracePeriodMinutes: 15,
    workEnd: "17:00",
    attendanceMode: "NETWORK_ONLY",
    crossOfficeAttendance: false,
  }),
}));
vi.mock("@/lib/network/verifyOfficeNetwork", () => ({
  verifyOfficeNetwork: async () => ({ allowed: true, officeNetworkId: "net1" }),
}));
vi.mock("@/lib/attendance/deviceFlags", () => ({ flagDeviceReuseIfNeeded: async () => {} }));
vi.mock("@/lib/notifications/create", () => ({ notifyRole: async () => {} }));
vi.mock("@/lib/security/attendanceId", () => ({ hashAttendanceId: (s: string) => s, normalizeAttendanceId: (s: string) => s }));

const { recordAttendance } = await import("@/lib/attendance/engine");

const TASKS = [{ description: "Did work", status: "COMPLETED" }];
const input = { attendanceIdRaw: "ID", sourceIp: "1.2.3.4", userAgent: "vitest" };

/** Lagos is UTC+1 year-round. */
const lagos = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+01:00`);

describe("clock-in → clock-out across the working day", () => {
  beforeEach(() => {
    records.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["08:45", "17:30"],
    ["11:59", "17:30"],
    ["12:00", "17:30"],
    ["12:30", "17:30"],
    ["13:15", "18:00"],
    ["15:00", "16:30"],
    ["20:00", "23:30"],
    ["22:00", "01:30"],
  ])("clock in at %s, come back at %s → clock-out flow, not a repeat clock-in", async (inAt, outAt) => {
    vi.setSystemTime(lagos("2026-11-02", inAt));
    const first = await recordAttendance(input);
    expect(first.ok && first.action).toBe("CLOCK_IN");

    const outDate = outAt < inAt ? "2026-11-03" : "2026-11-02";
    vi.setSystemTime(lagos(outDate, outAt));

    // Coming back with just the ID must start clock-out (ask for the report)...
    const second = await recordAttendance(input);
    expect(second).toMatchObject({ ok: false, reason: "TASK_REPORT_REQUIRED" });

    // ...and submitting the report must actually clock them out.
    const third = await recordAttendance({ ...input, tasks: TASKS, earlyClockOutReason: "Leaving early" });
    expect(third.ok && third.action).toBe("CLOCK_OUT");
    expect(records).toHaveLength(1);
  });
});
