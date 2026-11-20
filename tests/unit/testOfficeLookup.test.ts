import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/attendance/test-office/route";
import { RATE_LIMITS } from "@/lib/security/rateLimit";

const { findEmployee, checkRateLimit, getClientIp, getCurrentUser, verifyOfficeNetwork } = vi.hoisted(() => ({
  findEmployee: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  getCurrentUser: vi.fn(),
  verifyOfficeNetwork: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { employee: { findFirst: findEmployee } } }));
vi.mock("@/lib/security/rateLimit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/security/rateLimit")>(),
  checkRateLimit,
}));
vi.mock("@/lib/network/getClientIp", () => ({ getClientIp }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/network/verifyOfficeNetwork", () => ({ verifyOfficeNetwork }));
vi.mock("@/lib/security/attendanceId", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/security/attendanceId")>(),
  hashAttendanceId: (id: string) => `hashed:${id}`,
}));

const office = { name: "Main office", latitude: 6.42, longitude: 3.41, locationRadiusMeters: 150 };

function request(payload: object) {
  return POST(new Request("https://example.test/api/attendance/test-office", {
    method: "POST",
    body: JSON.stringify(payload),
  }));
}

function lookup(attendanceId = " atd-ab2345 ") {
  return request({ attendanceId });
}

describe("employee geofence lookup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getClientIp.mockReturnValue("192.0.2.1");
    checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns only the active employee's assigned office boundary", async () => {
    findEmployee.mockResolvedValue({ office: { ...office, id: "assigned-office" } });
    const result = await lookup();
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.json()).toEqual({ office });
    expect(findEmployee).toHaveBeenCalledWith({
      where: { attendanceIdLookup: "hashed:ATD-AB2345", isDeleted: false, employmentStatus: "ACTIVE" },
      select: { office: { select: { id: true, name: true, latitude: true, longitude: true, locationRadiusMeters: true } } },
    });
  });

  it("limits lookups before querying employee records", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 45 });
    const result = await lookup();
    expect(result.status).toBe(429);
    expect(result.headers.get("Retry-After")).toBe("45");
    expect(checkRateLimit).toHaveBeenCalledWith("192.0.2.1", RATE_LIMITS.testOfficeLookup);
    expect(findEmployee).not.toHaveBeenCalled();
  });

  it("handles unrecognized IDs and offices without saved coordinates", async () => {
    const unsetOffice = { ...office, latitude: null };
    findEmployee.mockResolvedValueOnce(null).mockResolvedValueOnce({ office: { ...unsetOffice, id: "assigned-office" } });
    expect((await lookup()).status).toBe(404);
    expect(await (await lookup()).json()).toEqual({ office: unsetOffice });
  });

  it("checks the employee's assigned network even without a saved location", async () => {
    findEmployee.mockResolvedValue({ office: { ...office, latitude: null, id: "assigned-office" } });
    verifyOfficeNetwork.mockResolvedValue({ allowed: true, officeNetworkId: "internal-network" });
    const result = await request({ attendanceId: "atd-ab2345", checkNetwork: true });
    expect(await result.json()).toEqual({ network: { allowed: true, sourceIp: "192.0.2.1" } });
    expect(verifyOfficeNetwork).toHaveBeenCalledWith("assigned-office", "192.0.2.1", { requireFresh: true });
  });

  it("requires office-view permission to check a selected office by ID", async () => {
    const payload = { officeId: "selected-office", checkNetwork: true };
    expect((await request(payload)).status).toBe(403);
    expect(verifyOfficeNetwork).not.toHaveBeenCalled();

    getCurrentUser.mockResolvedValue({ role: "ADMIN" });
    verifyOfficeNetwork.mockResolvedValue({ allowed: false, reason: "IP_NOT_AUTHORIZED" });
    const result = await request(payload);
    expect(await result.json()).toEqual({ network: { allowed: false, reason: "IP_NOT_AUTHORIZED", sourceIp: "192.0.2.1" } });
    expect(verifyOfficeNetwork).toHaveBeenCalledWith("selected-office", "192.0.2.1", { requireFresh: true });
  });

  it("skips the lookup when the request has no trusted source IP or the ID is invalid", async () => {
    expect((await lookup("ab")).status).toBe(400);
    getClientIp.mockReturnValue(null);
    expect((await lookup()).status).toBe(400);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(findEmployee).not.toHaveBeenCalled();
  });
});
