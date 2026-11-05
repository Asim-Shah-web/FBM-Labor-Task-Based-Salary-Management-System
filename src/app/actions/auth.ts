"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth/auth";
import { getCurrentUser } from "@/server/auth/current-user";
import { requireUser } from "@/server/authz/require";
import { prisma } from "@/server/db/prisma";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";
import { audit } from "@/server/services/audit.service";

export type FormState = { error?: string } | undefined;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      // One generic message for every failure (wrong password, unknown user, locked, inactive).
      return { error: "Invalid username or password, or the account is temporarily locked." };
    }
    throw e; // signIn's success redirect is thrown as an error; it must propagate.
  }
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
