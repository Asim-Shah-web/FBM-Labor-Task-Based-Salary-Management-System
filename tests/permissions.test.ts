import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_NAMES, ROLE_PERMISSIONS } from "@/server/authz/permissions";
import { NAV_ITEMS } from "@/lib/nav";

describe("single manager role", () => {
  it("defines exactly one role: MANAGER", () => {
    expect([...ROLE_NAMES]).toEqual(["MANAGER"]);
  });

  it("manager has every permission", () => {
    expect(new Set(ROLE_PERMISSIONS.MANAGER)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it("only references defined permission codes", () => {
    for (const code of ROLE_PERMISSIONS.MANAGER) expect(PERMISSIONS).toHaveProperty(code);
  });

  it("covers the daily workflow", () => {
    for (const p of ["work:write", "allowance:write", "attendance:write", "settlement:create", "settlement:reverse", "advance:issue", "advance:recover", "rate:change"] as const)
      expect(ROLE_PERMISSIONS.MANAGER).toContain(p);
  });

  it("every nav item uses a defined permission", () => {
    for (const item of NAV_ITEMS) expect(PERMISSIONS).toHaveProperty(item.permission);
  });
});
