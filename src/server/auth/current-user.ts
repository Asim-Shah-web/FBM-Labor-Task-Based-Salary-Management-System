import { cache } from "react";
import { auth } from "./auth";
import { SESSION_ABSOLUTE_HOURS } from "./auth.config";
import { prisma } from "@/server/db/prisma";
import type { PermissionCode } from "@/server/authz/permissions";

export type CurrentUser = {
  id: string;
  username: string;
  fullName: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: PermissionCode[];
};

/**
 * Resolves the logged-in user from the DB on every request (memoized per request).
 * Returns null when: no session, user deleted/deactivated, sessionVersion changed
 * (password change / forced logout), or the absolute session lifetime was exceeded.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const s = session?.user;
  if (!s?.id) return null;
  if (Date.now() - s.loginAt > SESSION_ABSOLUTE_HOURS * 3_600_000) return null;

  const user = await prisma.user.findUnique({
    where: { id: s.id },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!user || !user.isActive || user.sessionVersion !== s.sv) return null;

  const permissions = new Set<PermissionCode>();
  for (const ur of user.roles)
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code as PermissionCode);

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles.map((r) => r.role.name),
    permissions: [...permissions],
  };
});
