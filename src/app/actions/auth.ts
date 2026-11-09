"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth/auth";
import { getClientIp } from "@/server/auth/ip";
import { checkCredentials } from "@/server/auth/credentials";
import { createChallenge, resendChallenge, verifyChallenge } from "@/server/auth/otp";
import { rateLimit } from "@/server/auth/rate-limit";
import { verifyTurnstile } from "@/server/auth/turnstile";
import { DomainError } from "@/server/errors";
import { runAction, type ActionResult } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/current-user";
import { requireUser } from "@/server/authz/require";
import { prisma } from "@/server/db/prisma";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import { audit } from "@/server/services/audit.service";

export type FormState = { error?: string } | undefined;

// ───────────── Two-step login: (1) password, (2) emailed code ─────────────

const startSchema = z.object({
  username: z.string().min(1, "Enter your username.").max(254),
  password: z.string().min(1, "Enter your password.").max(256),
  turnstileToken: z.string().max(4096).optional(),
});

/** Step 1. Checks Turnstile, then username + password, then emails a code. NEVER creates a session. */
export async function startLoginAction(input: z.input<typeof startSchema>) {
  return runAction<{ challengeId: string; emailHint: string }>(async () => {
    const data = startSchema.parse(input);
    const ip = getClientIp(await headers());

    if (!rateLimit(`login:ip:${ip}`, 20, 15 * 60_000)) {
      await audit({ action: "auth.login.rate_limited", meta: { ip } });
      throw new DomainError("RATE_LIMIT", "Too many attempts. Please wait a few minutes and try again.");
    }
    if (!(await verifyTurnstile(data.turnstileToken, ip)))
      throw new DomainError("CAPTCHA", "The security check failed. Please wait a moment and try again.");

    const user = await checkCredentials(data.username, data.password, ip);
    // One generic message for wrong password, unknown user, locked, or inactive account.
    if (!user) throw new DomainError("LOGIN_FAILED", "Invalid username or password, or the account is temporarily locked.");

    return { data: await createChallenge(user, ip) };
  });
}

const codeSchema = z.object({ challengeId: z.string().min(20).max(80), code: z.string().max(20) });

/** Step 2. Checks the emailed code, then (and only then) creates the session. */
export async function verifyLoginAction(input: z.input<typeof codeSchema>): Promise<ActionResult> {
  const checked = await runAction(async () => {
    const data = codeSchema.parse(input);
    const ip = getClientIp(await headers());
    if (!rateLimit(`otp:ip:${ip}`, 40, 15 * 60_000)) throw new DomainError("RATE_LIMIT", "Too many attempts. Please wait a few minutes.");
    await verifyChallenge(data.challengeId, data.code, ip);
  });
  if (!checked.ok) return checked;

  try {
    await signIn("credentials", { challengeId: input.challengeId, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: "Sign-in could not be completed. Please sign in again." };
    throw e; // the success redirect is thrown by signIn and must propagate
  }
  return { ok: true };
}

export async function resendCodeAction(input: { challengeId: string }) {
  return runAction(async () => {
    const challengeId = z.string().min(20).max(80).parse(input.challengeId);
    const ip = getClientIp(await headers());
    if (!rateLimit(`otp-resend:ip:${ip}`, 10, 15 * 60_000)) throw new DomainError("RATE_LIMIT", "Too many requests. Please wait a few minutes.");
    await resendChallenge(challengeId, ip);
    return { message: "A new code was sent." };
  });
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await audit({ userId: user.id, action: "auth.logout" });
  await signOut({ redirectTo: "/login" });
}

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(1),
    confirm: z.string().min(1),
  })
  .refine((v) => v.next === v.confirm, { message: "New passwords do not match.", path: ["confirm"] });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const sessionUser = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.current))) {
    await audit({ userId: sessionUser.id, action: "auth.password_change.failed" });
    return { error: "Current password is incorrect." };
  }
  if (parsed.data.next === parsed.data.current) return { error: "Choose a different password from the current one." };

  const policy = checkPasswordPolicy(parsed.data.next, user.username);
  if (!policy.ok) return { error: policy.message };

  const passwordHash = await hashPassword(parsed.data.next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: { increment: 1 }, // invalidates every existing session, including this one
      },
    });
    await audit({ userId: user.id, action: "auth.password_change" }, tx);
  });

  await signOut({ redirectTo: "/login?changed=1" });
}
