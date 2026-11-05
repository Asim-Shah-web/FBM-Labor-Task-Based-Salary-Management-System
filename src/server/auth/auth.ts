import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { audit } from "@/server/services/audit.service";
import { dummyHash, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { authConfig } from "./auth.config";

const MAX_FAILED_BEFORE_LOCK = 5;
const BASE_LOCK_MINUTES = 15;

const credentialsSchema = z.object({
  username: z.string().min(1).max(254),
  password: z.string().min(1).max(256),
});

function clientIp(request: Request): string {
  // Only trustworthy if your reverse proxy sets/overwrites X-Forwarded-For.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const ident = parsed.data.username.trim().toLowerCase();
        const { password } = parsed.data;
        const ip = clientIp(request);

        if (!rateLimit(`login:ip:${ip}`, 20, 15 * 60_000)) {
          await audit({ action: "auth.login.rate_limited", meta: { ip, ident } });
          return null;
        }

        const user = await prisma.user.findFirst({
          where: { OR: [{ username: ident }, { email: ident }] },
        });

        // Always do one hash verification so response time doesn't reveal if the user exists.
        if (!user) {
          await verifyPassword(await dummyHash(), password);
          await audit({ action: "auth.login.failed", meta: { ip, ident, reason: "unknown_user" } });
          return null;
        }

        const now = new Date();
        if (!user.isActive || (user.lockedUntil && user.lockedUntil > now)) {
          await verifyPassword(await dummyHash(), password);
          await audit({
            userId: user.id,
            action: "auth.login.blocked",
            meta: { ip, reason: user.isActive ? "locked" : "inactive" },
          });
          return null;
        }

        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) {
          const updated = await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: { increment: 1 } },
            select: { failedLoginCount: true },
          });
          let lockedUntil: Date | null = null;
          if (updated.failedLoginCount >= MAX_FAILED_BEFORE_LOCK) {
            // 5 fails -> 15 min, 10 -> 30 min, 15 -> 60 min ... (capped at 16x)
            const tier = Math.min(Math.floor(updated.failedLoginCount / MAX_FAILED_BEFORE_LOCK) - 1, 4);
            lockedUntil = new Date(now.getTime() + BASE_LOCK_MINUTES * 60_000 * 2 ** tier);
            await prisma.user.update({ where: { id: user.id }, data: { lockedUntil } });
          }
          await audit({
            userId: user.id,
            action: "auth.login.failed",
            meta: { ip, reason: "bad_password", failedCount: updated.failedLoginCount, lockedUntil: lockedUntil?.toISOString() ?? null },
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
        });
        await audit({ userId: user.id, action: "auth.login", meta: { ip } });

        return { id: user.id, name: user.fullName, email: user.email, sessionVersion: user.sessionVersion } as {
          id: string;
          name: string;
          email: string | null;
          sessionVersion: number;
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        // Runs only at sign-in: stamp the token with the user's session version + login time.
        token.uid = user.id;
        token.sv = (user as unknown as { sessionVersion: number }).sessionVersion;
        token.loginAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.sv = token.sv as number;
      session.user.loginAt = token.loginAt as number;
      return session;
    },
  },
});

export { CredentialsSignin };
