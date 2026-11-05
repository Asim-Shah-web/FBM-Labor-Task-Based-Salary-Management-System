import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/server/auth/current-user";
import type { PermissionCode } from "./permissions";

export class AuthzError extends Error {
  constructor(public readonly code: "FORBIDDEN", message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthzError";
  }
}

export const can = (user: Pick<CurrentUser, "permissions">, code: PermissionCode) =>
  user.permissions.includes(code);

/** For pages/layouts/actions: redirects to /login if not signed in (or session invalid). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Call this at the top of EVERY Server Action / Route Handler / data function.
 * Throws AuthzError if the user lacks the permission (never rely on hidden buttons).
 */
export async function requirePermission(code: PermissionCode): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, code)) throw new AuthzError("FORBIDDEN");
  return user;
}

/** For pages: send users without access back to the dashboard instead of crashing. */
export async function requirePagePermission(code: PermissionCode): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, code)) redirect("/dashboard?denied=1");
  return user;
}
