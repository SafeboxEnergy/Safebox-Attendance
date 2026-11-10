import { PrismaClient } from "@prisma/client";

/**
 * Secrets that must never leave the server are omitted from every query result
 * by default, so a row can be handed to a React Client Component (or returned
 * from a Server Action) without leaking them. Props passed to a Client
 * Component are serialized into the RSC payload embedded in the HTML, so
 * `prisma.user.findMany()` straight into a component used to ship every
 * admin's bcrypt hash to the browser.
 *
 * The three places that genuinely need these values opt back in explicitly
 * with `omit: { <field>: false }` — grep for that to find every consumer:
 *  - lib/actions/auth.ts        passwordHash, to verify a login
 *  - lib/network/heartbeat.ts   agentSigningSecret, to check the HMAC
 *  - lib/network/register.ts    registrationTokenHash, to verify the token
 *
 * `omit` only affects what is read back; writes (`data: { passwordHash }`) and
 * `where` filters are unaffected.
 */
const prismaClientSingleton = () =>
  new PrismaClient({
    omit: {
      user: { passwordHash: true },
      officeNetwork: { agentSigningSecret: true, registrationTokenHash: true },
    },
  });

declare global {
  var __prisma: ReturnType<typeof prismaClientSingleton> | undefined;
}

// Reuse the client across hot reloads / warm serverless invocations so we don't
// exhaust Postgres connections on Vercel's serverless functions.
export const prisma = global.__prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
