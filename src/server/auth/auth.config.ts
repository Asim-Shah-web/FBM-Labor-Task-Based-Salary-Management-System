import type { NextAuthConfig } from "next-auth";

// Edge-safe part of the Auth.js config (used by middleware). No Prisma / argon2 imports here.
export const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES ?? 30);
export const SESSION_ABSOLUTE_HOURS = Number(process.env.SESSION_ABSOLUTE_HOURS ?? 8);

export const authConfig = {
  pages: { signIn: "/login" },
  session: {
    strategy: "jwt",
    maxAge: SESSION_IDLE_MINUTES * 60, // sliding idle timeout (cookie is re-issued on activity)
    updateAge: 5 * 60,
  },
  providers: [], // Credentials provider is added in auth.ts (needs Node runtime)
  callbacks: {
    // Middleware gate: a cheap "has a session cookie" redirect. NOT authorization.
    // Real checks (active user, sessionVersion, permissions) happen server-side in
    // getCurrentUser() / requirePermission(). /login is always reachable so a stale
    // cookie can never cause a redirect loop.
    authorized({ auth, request }) {
      if (request.nextUrl.pathname === "/login") return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
