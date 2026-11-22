import { z } from "zod";
import { hasPermission } from "@/lib/auth/rbac";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getClientIp } from "@/lib/network/getClientIp";
import { verifyOfficeNetwork } from "@/lib/network/verifyOfficeNetwork";
import { hashAttendanceId, normalizeAttendanceId } from "@/lib/security/attendanceId";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

const requestSchema = z.union([
  z.strictObject({ attendanceId: z.string().trim().min(3).max(40), checkNetwork: z.boolean().optional() }),
  z.strictObject({ officeId: z.string().min(1).max(100), checkNetwork: z.literal(true) }),
]);

async function checkNetwork(officeId: string, sourceIp: string) {
  const network = await verifyOfficeNetwork(officeId, sourceIp, { requireFresh: true });
  return reply({
    network: network.allowed
      ? { allowed: true, sourceIp }
      : { allowed: false, reason: network.reason, sourceIp },
  }, 200);
}

function reply(body: object, status: number, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  const sourceIp = getClientIp(request);
  if (!sourceIp) return reply({ message: "Could not verify your connection. Please try again." }, 400);

  const raw = await request.text().catch(() => "");
  if (raw.length > 512) return reply({ message: "Invalid request." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ message: "Invalid request." }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return reply({ message: "Enter your Attendance ID." }, 400);

  const limit = await checkRateLimit(sourceIp, RATE_LIMITS.testOfficeLookup);
  if (!limit.allowed) {
    return reply({ message: "Too many attempts. Please wait and try again." }, 429, limit.retryAfterSeconds);
  }

  const input = parsed.data;
  if ("officeId" in input) {
    const user = await getCurrentUser();
    if (!user || !hasPermission(user.role, "offices", "view")) {
      return reply({ message: "Sign in or use your Attendance ID to check your office network." }, 403);
    }
    return checkNetwork(input.officeId, sourceIp);
  }

  const attendanceIdLookup = hashAttendanceId(normalizeAttendanceId(input.attendanceId));
  const employee = await prisma.employee.findFirst({
    where: { attendanceIdLookup, isDeleted: false, employmentStatus: "ACTIVE" },
    select: { office: { select: { id: true, name: true, latitude: true, longitude: true, locationRadiusMeters: true } } },
  });

  if (!employee) return reply({ message: "Attendance ID not recognized." }, 404);
  const { id, ...office } = employee.office;
  if (input.checkNetwork) return checkNetwork(id, sourceIp);
  return reply({ office }, 200);
}
