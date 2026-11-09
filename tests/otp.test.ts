import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "test-secret-test-secret-test-secret";

// ---- in-memory stand-in for the parts of Prisma that otp.ts uses -------------------------------
type Row = Record<string, any>;
const challenges = new Map<string, Row>();
const users = new Map<string, Row>();

const match = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond === null) return v === null || v === undefined;
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      return Object.entries(cond as Row).every(([op, x]) =>
        op === "gte" ? v >= x : op === "gt" ? v > x : op === "lt" ? v < x : op === "lte" ? v <= x : false);
    }
    return v === cond;
  });
const apply = (row: Row, data: Row) => {
  for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && "increment" in v ? (row[k] ?? 0) + v.increment : v;
};

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    loginChallenge: {
      count: async ({ where }: any) => [...challenges.values()].filter((r) => match(r, where)).length,
      updateMany: async ({ where, data }: any) => { const rows = [...challenges.values()].filter((r) => match(r, where)); rows.forEach((r) => apply(r, data)); return { count: rows.length }; },
      deleteMany: async ({ where }: any) => { let n = 0; for (const [id, r] of challenges) if (match(r, where)) { challenges.delete(id); n++; } return { count: n }; },
      create: async ({ data }: any) => { const r = { attempts: 0, sends: 1, lastSentAt: new Date(), verifiedAt: null, consumedAt: null, createdAt: new Date(), ...data }; challenges.set(r.id, r); return r; },
      findUnique: async ({ where, include }: any) => { const r = challenges.get(where.id); if (!r) return null; return include?.user ? { ...r, user: users.get(r.userId) } : { ...r }; },
      update: async ({ where, data }: any) => { const r = challenges.get(where.id)!; apply(r, data); return { ...r }; },
    },
  },
}));
vi.mock("@/server/services/audit.service", () => ({ audit: vi.fn(async () => {}) }));
const sendMail = vi.fn(async (_m: { to: string; text: string }) => {});
vi.mock("@/server/mail/mailer", () => ({ sendMail: (m: any) => sendMail(m) }));

import { OTP, codesMatch, consumeVerifiedChallenge, createChallenge, generateCode, hashCode, maskEmail, resendChallenge, verifyChallenge } from "@/server/auth/otp";

const user = { id: "u1", email: "manager@gmail.com", isActive: true, fullName: "Manager" };
const lastCode = () => /code is: (\d{6})/.exec(sendMail.mock.calls.at(-1)![0].text)![1]!;
const wrong = (c: string) => (c === "000000" ? "111111" : "000000");

beforeEach(() => { challenges.clear(); users.clear(); users.set("u1", user); sendMail.mockClear(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-07T10:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("code helpers", () => {
  it("generates 6-digit codes (with leading zeros allowed)", () => {
    for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
  it("hashes and compares in a way bound to the challenge", () => {
    const h = hashCode("chal-1", "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(codesMatch(h, "chal-1", "123456")).toBe(true);
    expect(codesMatch(h, "chal-1", "123457")).toBe(false);
    expect(codesMatch(h, "chal-2", "123456")).toBe(false);
  });
  it("masks the email for display", () => {
    expect(maskEmail("manager@gmail.com")).toBe("m******@gmail.com");
    expect(maskEmail("ab@x.com")).toBe("a***@x.com");
  });
});

describe("email code login", () => {
  it("emails a code to the manager and never stores it in plain text", async () => {
    const c = await createChallenge(user, "1.2.3.4");
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0]![0].to).toBe("manager@gmail.com");
    expect(c.emailHint).toBe("m******@gmail.com");
    const row = challenges.get(c.challengeId)!;
    expect(JSON.stringify(row)).not.toContain(lastCode());
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("happy path: correct code -> exactly one login", async () => {
    const c = await createChallenge(user, "ip");
    await verifyChallenge(c.challengeId, lastCode(), "ip");
    expect((await consumeVerifiedChallenge(c.challengeId))?.id).toBe("u1");
    expect(await consumeVerifiedChallenge(c.challengeId)).toBeNull(); // single use
    await expect(verifyChallenge(c.challengeId, lastCode(), "ip")).rejects.toThrow(/expired/);
  });

  it("a challenge that was never verified cannot be turned into a login", async () => {
    const c = await createChallenge(user, "ip");
    expect(await consumeVerifiedChallenge(c.challengeId)).toBeNull();
    expect(await consumeVerifiedChallenge("made-up-id-made-up-id-made-up")).toBeNull();
  });

  it("wrong codes are counted and the challenge dies after 5", async () => {
    const c = await createChallenge(user, "ip");
    const good = lastCode();
    for (let i = 1; i <= OTP.maxAttempts - 1; i++)
      await expect(verifyChallenge(c.challengeId, wrong(good), "ip")).rejects.toThrow(/incorrect/);
    await expect(verifyChallenge(c.challengeId, wrong(good), "ip")).rejects.toThrow(/Too many/);
    // even the correct code no longer works
    await expect(verifyChallenge(c.challengeId, good, "ip")).rejects.toThrow(/expired/);
    expect(await consumeVerifiedChallenge(c.challengeId)).toBeNull();
  });

  it("tells the user how many tries are left", async () => {
    const c = await createChallenge(user, "ip");
    await expect(verifyChallenge(c.challengeId, wrong(lastCode()), "ip")).rejects.toThrow("4 tries left");
  });

  it("rejects malformed codes without counting an attempt", async () => {
    const c = await createChallenge(user, "ip");
    await expect(verifyChallenge(c.challengeId, "12ab56", "ip")).rejects.toThrow(/6-digit/);
    expect(challenges.get(c.challengeId)!.attempts).toBe(0);
    await verifyChallenge(c.challengeId, ` ${lastCode().slice(0, 3)} ${lastCode().slice(3)} `, "ip"); // spaces are tolerated
  });

  it("the code expires after 10 minutes", async () => {
    const c = await createChallenge(user, "ip");
    const good = lastCode();
    vi.setSystemTime(new Date("2026-11-07T10:10:01Z"));
    await expect(verifyChallenge(c.challengeId, good, "ip")).rejects.toThrow(/expired/);
  });

  it("the session must be created within 60 seconds of entering the code", async () => {
    const c = await createChallenge(user, "ip");
    await verifyChallenge(c.challengeId, lastCode(), "ip");
    vi.setSystemTime(new Date("2026-11-07T10:01:30Z"));
    expect(await consumeVerifiedChallenge(c.challengeId)).toBeNull();
  });

  it("starting a new login cancels the earlier code", async () => {
    const first = await createChallenge(user, "ip");
    const firstCode = lastCode();
    const second = await createChallenge(user, "ip");
    await expect(verifyChallenge(first.challengeId, firstCode, "ip")).rejects.toThrow(/expired/);
    await verifyChallenge(second.challengeId, lastCode(), "ip");
  });

  it("a code for one challenge does not work for another", async () => {
    const a = await createChallenge(user, "ip");
    const codeA = lastCode();
    users.set("u2", { ...user, id: "u2", email: "other@gmail.com" });
    const b = await createChallenge({ id: "u2", email: "other@gmail.com" }, "ip");
    await expect(verifyChallenge(b.challengeId, codeA === lastCode() ? wrong(codeA) : codeA, "ip")).rejects.toThrow(/incorrect/);
    expect(a.challengeId).not.toBe(b.challengeId);
  });

  it("refuses to start without an email address on the account", async () => {
    await expect(createChallenge({ id: "u1", email: null }, "ip")).rejects.toThrow(/No email address/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("limits how many codes can be triggered per hour", async () => {
    for (let i = 0; i < OTP.maxChallengesPerHour; i++) await createChallenge(user, "ip");
    await expect(createChallenge(user, "ip")).rejects.toThrow(/Too many sign-in attempts/);
    vi.setSystemTime(new Date("2026-11-07T11:01:00Z"));
    await createChallenge(user, "ip"); // allowed again after an hour
  });

  it("if the email cannot be sent, the challenge is cancelled", async () => {
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(createChallenge(user, "ip")).rejects.toThrow("smtp down");
    expect([...challenges.values()].every((c) => c.consumedAt)).toBe(true);
  });
});

describe("resending", () => {
  it("enforces a cooldown, then sends a NEW code and invalidates the old one", async () => {
    const c = await createChallenge(user, "ip");
    const oldCode = lastCode();
    await expect(resendChallenge(c.challengeId, "ip")).rejects.toThrow(/wait/);
    vi.setSystemTime(new Date("2026-11-07T10:00:31Z"));
    await resendChallenge(c.challengeId, "ip");
    const newCode = lastCode();
    expect(sendMail).toHaveBeenCalledTimes(2);
    if (newCode !== oldCode) await expect(verifyChallenge(c.challengeId, oldCode, "ip")).rejects.toThrow(/incorrect/);
    await verifyChallenge(c.challengeId, newCode, "ip");
  });

  it("wrong guesses are NOT reset by resending, and the number of sends is capped", async () => {
    const c = await createChallenge(user, "ip");
    await expect(verifyChallenge(c.challengeId, wrong(lastCode()), "ip")).rejects.toThrow();
    vi.setSystemTime(new Date("2026-11-07T10:01:00Z"));
    await resendChallenge(c.challengeId, "ip");
    expect(challenges.get(c.challengeId)!.attempts).toBe(1);
    for (let i = 2; i < OTP.maxSends; i++) { vi.setSystemTime(new Date(Date.parse("2026-11-07T10:01:00Z") + i * 31_000)); await resendChallenge(c.challengeId, "ip"); }
    vi.setSystemTime(new Date("2026-11-07T10:08:00Z"));
    await expect(resendChallenge(c.challengeId, "ip")).rejects.toThrow(/No more codes/);
  });

  it("cannot resend for an unknown, verified or expired challenge", async () => {
    await expect(resendChallenge("nope-nope-nope-nope-nope", "ip")).rejects.toThrow(/expired/);
    const c = await createChallenge(user, "ip");
    await verifyChallenge(c.challengeId, lastCode(), "ip");
    vi.setSystemTime(new Date("2026-11-07T10:05:00Z"));
    await expect(resendChallenge(c.challengeId, "ip")).rejects.toThrow(/expired/);
  });
});
