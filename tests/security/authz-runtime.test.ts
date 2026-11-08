import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
  unstable_rethrow: (e: unknown) => { if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e; },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { AuthzError, can, requirePagePermission, requirePermission, requireUser } from "@/server/authz/require";
import { runAction } from "@/server/action-result";
import { DomainError } from "@/server/errors";
import { z } from "zod";
import type { PermissionCode } from "@/server/authz/permissions";

const manager = { id: "u1", username: "m", fullName: "M", mustChangePassword: false, roles: ["MANAGER"], permissions: ["worker:read", "work:write"] as PermissionCode[] };

beforeEach(() => getCurrentUser.mockReset());

describe("requireUser / requirePermission", () => {
  it("sends anonymous visitors to /login", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
    await expect(requirePermission("worker:read")).rejects.toThrow("NEXT_REDIRECT:/login");
  });
  it("allows a user who holds the permission", async () => {
    getCurrentUser.mockResolvedValue(manager);
    await expect(requirePermission("work:write")).resolves.toMatchObject({ id: "u1" });
  });
  it("rejects a signed-in user who lacks the permission", async () => {
    getCurrentUser.mockResolvedValue(manager);
    await expect(requirePermission("settlement:create")).rejects.toBeInstanceOf(AuthzError);
  });
  it("pages redirect (not crash) when the permission is missing", async () => {
    getCurrentUser.mockResolvedValue(manager);
    await expect(requirePagePermission("settlement:read")).rejects.toThrow("NEXT_REDIRECT:/dashboard?denied=1");
  });
  it("can() only trusts the permission list", () => {
    expect(can(manager, "worker:read")).toBe(true);
    expect(can(manager, "audit:read")).toBe(false);
  });
});

describe("runAction error handling", () => {
  it("returns business errors as messages", async () => {
    const r = await runAction(async () => { throw new DomainError("X", "Amount exceeds outstanding."); });
    expect(r).toEqual({ ok: false, error: "Amount exceeds outstanding." });
  });
  it("turns authorization failures into a refusal, not a crash", async () => {
    const r = await runAction(async () => { throw new AuthzError("FORBIDDEN"); });
    expect(r.ok).toBe(false);
  });
  it("reports validation problems from Zod", async () => {
    const r = await runAction(async () => { z.object({ a: z.string().min(3, "Too short.") }).parse({ a: "x" }); });
    expect(r).toEqual({ ok: false, error: "Too short." });
  });
  it("never leaks internal error details to the user", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runAction(async () => { throw new Error("connection string postgres://fbm:secret@host/db failed"); });
    expect(r).toEqual({ ok: false, error: "Something went wrong. Please try again." });
    expect(JSON.stringify(r)).not.toContain("secret");
    spy.mockRestore();
  });
  it("re-throws redirects so Next.js can handle them", async () => {
    await expect(runAction(async () => { throw new Error("NEXT_REDIRECT:/x"); })).rejects.toThrow("NEXT_REDIRECT");
  });
  it("passes success data and messages through", async () => {
    expect(await runAction(async () => ({ data: { id: "1" }, message: "ok" }))).toEqual({ ok: true, data: { id: "1" }, message: "ok" });
  });
});
