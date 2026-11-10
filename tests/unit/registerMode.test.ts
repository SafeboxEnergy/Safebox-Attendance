import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "NETWORK_ONLY",
  cookies: vi.fn(async () => ({ get: () => ({ value: "old-qr-session" }) })),
  getActiveQrSession: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/company/settings", () => ({ getCompanySettings: async () => ({ companyName: "Test" }) }));
vi.mock("@/lib/attendance/settings", () => ({ getAttendanceSettings: async () => ({ attendanceMode: mocks.mode, kioskResetSeconds: 5 }) }));
vi.mock("@/lib/qr/session", () => ({ getActiveQrSession: mocks.getActiveQrSession }));
vi.mock("@/lib/attendance/clockHandler", () => ({ QR_SESSION_COOKIE: "attendance_qr_session" }));
vi.mock("@/components/attendance/AttendanceRegister", () => ({ AttendanceRegister: () => null }));

import RegisterPage from "@/app/register/page";

describe("register attendance modes", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["LOCATION_ONLY", true, false],
    ["NETWORK_ONLY", false, false],
    ["QR_ONLY", true, true],
  ])("%s passes the appropriate location and QR requirements", async (mode, checkLocation, hasQrSession) => {
    mocks.mode = mode;
    const page = await RegisterPage({ searchParams: Promise.resolve({}) });
    expect(page.props).toMatchObject({ checkLocation, hasQrSession });
    expect(mocks.getActiveQrSession).toHaveBeenCalledTimes(mode === "QR_ONLY" ? 1 : 0);
  });
});
