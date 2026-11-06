import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AuthzError } from "@/server/authz/require";
import { DomainError } from "@/server/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

/**
 * Wraps a Server Action body: turns known errors into a user-safe message and
 * logs anything unexpected. Redirects/not-found thrown by Next.js are re-thrown.
 */
export async function runAction<T>(fn: () => Promise<{ data?: T; message?: string } | void>): Promise<ActionResult<T>> {
  try {
    const out = await fn();
    return { ok: true, ...(out ?? {}) };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof AuthzError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "That record already exists (duplicate)." };
    console.error("Unexpected action error:", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
