// Step 1 of login: check username + password (with lockout and audit). This NEVER creates a session.
import { prisma } from "@/server/db/prisma";
import { audit } from "@/server/services/audit.service";
import { dummyHash, verifyPassword } from "./password";

const MAX_FAILED_BEFORE_LOCK = 5;
const BASE_LOCK_MINUTES = 15;

export async function checkCredentials(identRaw: string, password: string, ip: string) {
  const ident = identRaw.trim().toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ username: ident }, { email: ident }] } });

  // Always do one hash verification so response time does not reveal whether the user exists.
  if (!user) {
    await verifyPassword(await dummyHash(), password);
    await audit({ action: "auth.login.failed", meta: { ip, ident, reason: "unknown_user" } });
    return null;
  }

  const now = new Date();
  if (!user.isActive || (user.lockedUntil && user.lockedUntil > now)) {
    await verifyPassword(await dummyHash(), password);
    await audit({ userId: user.id, action: "auth.login.blocked", meta: { ip, reason: user.isActive ? "locked" : "inactive" } });
    return null;
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    const updated = await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
    let lockedUntil: Date | null = null;
    if (updated.failedLoginCount >= MAX_FAILED_BEFORE_LOCK) {
      // 5 fails -> 15 min, 10 -> 30 min, 15 -> 60 min ... (capped at 16x)
      const tier = Math.min(Math.floor(updated.failedLoginCount / MAX_FAILED_BEFORE_LOCK) - 1, 4);
      lockedUntil = new Date(now.getTime() + BASE_LOCK_MINUTES * 60_000 * 2 ** tier);
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil } });
    }
    await audit({ userId: user.id, action: "auth.login.failed", meta: { ip, reason: "bad_password", failedCount: updated.failedLoginCount, lockedUntil: lockedUntil?.toISOString() ?? null } });
    return null;
  }

  await audit({ userId: user.id, action: "auth.password_ok", meta: { ip } });
  return user;
}
