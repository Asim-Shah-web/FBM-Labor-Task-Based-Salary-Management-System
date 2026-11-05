import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_NAMES, ROLE_PERMISSIONS } from "@/server/authz/permissions";
import { NAV_ITEMS } from "@/lib/nav";

describe("role permissions", () => {
  it("only references defined permission codes", () => {
    for (const role of ROLE_NAMES)
      for (const code of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toHaveProperty(code);
  });

  it("admin has everything; manager lacks only user/settings management", () => {
    expect(new Set(ROLE_PERMISSIONS.ADMIN)).toEqual(new Set(ALL_PERMISSIONS));
    const missing = ALL_PERMISSIONS.filter((p) => !ROLE_PERMISSIONS.MANAGER.includes(p));
    expect(missing.sort()).toEqual(["settings:manage", "user:manage"]);
  });

  it("manager can run the daily workflow", () => {
    for (const p of ["work:write", "allowance:write", "settlement:create", "settlement:reverse", "advance:issue", "advance:recover"] as const)
      expect(ROLE_PERMISSIONS.MANAGER).toContain(p);
  });

  it("viewer is strictly read-only", () => {
    for (const p of ROLE_PERMISSIONS.VIEWER) expect(p).toMatch(/:(read|export)$/);
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain("settlement:create");
  });

  it("every nav item uses a defined permission", () => {
    for (const item of NAV_ITEMS) expect(PERMISSIONS).toHaveProperty(item.permission);
  });
});
