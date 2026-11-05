import { describe, expect, it } from "vitest";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("Correct-Horse-9");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Correct-Horse-9")).toBe(true);
    expect(await verifyPassword(h, "wrong-password-1")).toBe(false);
  });

  it("returns false (not throws) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("password policy", () => {
  it("rejects weak passwords", () => {
    expect(checkPasswordPolicy("short1").ok).toBe(false);
    expect(checkPasswordPolicy("onlylettersonly").ok).toBe(false);
    expect(checkPasswordPolicy("1234567890").ok).toBe(false);
    expect(checkPasswordPolicy("Password123").ok).toBe(false);
    expect(checkPasswordPolicy("manager-secret-99", "manager").ok).toBe(false);
  });
  it("accepts a reasonable password", () => {
    expect(checkPasswordPolicy("blue-Falcon-2026").ok).toBe(true);
  });
});
