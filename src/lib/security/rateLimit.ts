import { prisma } from "@/lib/db/prisma";

export interface RateLimitConfig {
  /** Logical bucket name, e.g. "attendance-id", "admin-login". */
  scope: string;
  /** Max attempts allowed within the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
  /** Lockout duration in seconds once the limit is exceeded. */
  lockoutSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Persistent, Postgres-backed rate limiter — safe across Vercel's stateless
 * serverless invocations, unlike an in-memory counter which resets per cold start
 * and isn't shared across concurrent function instances.
 *
 * Uses a single atomic UPDATE ... RETURNING (falling back to INSERT) so concurrent
 * requests for the same key can't race past the limit.
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const bucketKey = `${config.scope}:${key}`;
  const now = new Date();

  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key: bucketKey } });

  if (bucket?.lockedUntil && bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.lockedUntil.getTime() - now.getTime()) / 1000),
    };
  }

  const windowExpired =
    !bucket || now.getTime() - bucket.windowStart.getTime() > config.windowSeconds * 1000;

  if (windowExpired) {
    await prisma.rateLimitBucket.upsert({
      where: { key: bucketKey },
      create: { key: bucketKey, count: 1, windowStart: now, lockedUntil: null },
      update: { count: 1, windowStart: now, lockedUntil: null },
    });
    return { allowed: true };
  }

  const newCount = bucket.count + 1;
  if (newCount > config.limit) {
    const lockedUntil = new Date(now.getTime() + config.lockoutSeconds * 1000);
    await prisma.rateLimitBucket.update({
      where: { key: bucketKey },
      data: { count: newCount, lockedUntil },
    });
    return { allowed: false, retryAfterSeconds: config.lockoutSeconds };
  }

  await prisma.rateLimitBucket.update({ where: { key: bucketKey }, data: { count: newCount } });
  return { allowed: true };
}

export const RATE_LIMITS = {
  attendanceId: { scope: "attendance-id", limit: 8, windowSeconds: 300, lockoutSeconds: 600 },
  testOfficeLookup: { scope: "test-office-lookup", limit: 60, windowSeconds: 60, lockoutSeconds: 60 },
  adminLogin: { scope: "admin-login", limit: 5, windowSeconds: 300, lockoutSeconds: 900 },
  qrLookup: { scope: "qr-lookup", limit: 20, windowSeconds: 60, lockoutSeconds: 120 },
  networkHeartbeat: { scope: "network-heartbeat", limit: 30, windowSeconds: 300, lockoutSeconds: 60 },
  networkRegister: { scope: "network-register", limit: 5, windowSeconds: 3600, lockoutSeconds: 3600 },
} as const satisfies Record<string, RateLimitConfig>;
