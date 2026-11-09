import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { audit } from "@/server/services/audit.service";
import { authConfig } from "./auth.config";
import { consumeVerifiedChallenge } from "./otp";

/**
 * SECURITY: this is the ONLY place a session is created, and it accepts ONLY a challenge id whose
 * emailed code was already verified (see otp.ts). A username and password alone can never log in:
 * they are checked in credentials.ts, which cannot create a session.
 */
const schema = z.object({ challengeId: z.string().min(20).max(80) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { challengeId: {} },
      async authorize(raw) {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await consumeVerifiedChallenge(parsed.data.challengeId);
        if (!user || !user.isActive) return null;

        await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await audit({ userId: user.id, action: "auth.login", meta: { method: "password+email_code" } });

        return { id: user.id, name: user.fullName, email: user.email, sessionVersion: user.sessionVersion } as {
          id: string; name: string; email: string | null; sessionVersion: number;
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
