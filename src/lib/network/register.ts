import { prisma } from "@/lib/db/prisma";
import { verifyRegistrationToken, generateAgentSigningSecret } from "./agentAuth";
import { recordAuditLog } from "@/lib/audit/log";

export type RegisterAgentResult =
  | { ok: true; agentSigningSecret: string }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_USED" | "INVALID_TOKEN" | "DISABLED" };

export async function registerNetworkAgent(params: {
  agentId: string;
  registrationToken: string;
  sourceIp: string;
}): Promise<RegisterAgentResult> {
  const network = await prisma.officeNetwork.findUnique({
    where: { agentId: params.agentId },
    // Needed to verify the one-time token — omitted from every other read (lib/db/prisma.ts).
    omit: { registrationTokenHash: false },
  });
  if (!network) return { ok: false, reason: "NOT_FOUND" };
  if (network.status === "DISABLED") return { ok: false, reason: "DISABLED" };
  if (!network.registrationTokenHash || network.registrationTokenUsedAt) {
    return { ok: false, reason: "ALREADY_USED" };
  }

  const valid = await verifyRegistrationToken(params.registrationToken, network.registrationTokenHash);
  if (!valid) return { ok: false, reason: "INVALID_TOKEN" };

  const agentSigningSecret = generateAgentSigningSecret();

  await prisma.officeNetwork.update({
    where: { id: network.id },
    data: {
      agentSigningSecret,
      registrationTokenUsedAt: new Date(),
      status: "UNVERIFIED",
    },
  });

  await recordAuditLog({
    action: "network.agent_registered",
    resource: "office_network",
    resourceId: network.id,
    ipAddress: params.sourceIp,
  });

  return { ok: true, agentSigningSecret };
}
