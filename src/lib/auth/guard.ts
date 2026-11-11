import "server-only";
import { getCurrentUser, type AdminUser } from "./session";
import { hasPermission, PERMISSIONS } from "./rbac";

export class UnauthorizedError extends Error {
  status = 401;
}
export class ForbiddenError extends Error {
  status = 403;
}

export async function requireUser(): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError("Not authenticated");
  return user;
}

export async function requirePermission(
  resource: keyof typeof PERMISSIONS,
  action: string
): Promise<AdminUser> {
  const user = await requireUser();
  if (!hasPermission(user.role, resource, action)) {
    throw new ForbiddenError(`Missing permission ${resource}.${action}`);
  }
  return user;
}
