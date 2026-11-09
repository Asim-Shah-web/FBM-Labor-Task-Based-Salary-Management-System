/** DATABASE integration test of the emailed-code login against real PostgreSQL (needs TEST_DATABASE_URL). */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.AUTH_SECRET ??= "integration-test-secret-integration-test";

const sent: string[] = [];
vi.mock("@/server/mail/mailer", () => ({ sendMail: async (m: { text: string }) => { sent.push(m.text); } }));

describe.skipIf(!url)("email code login (database)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let otp: typeof import("@/server/auth/otp");
  let user: { id: string; email: string };
  const code = () => /code is: (\d{6})/.exec(sent.at(-1)!)![1]!;

  beforeAll(async () => {
    prisma = (await import("@/server/db/prisma")).prisma;
    otp = await import("@/server/auth/otp");
    const tag = Math.random().toString(36).slice(2, 8);
    const u = await prisma.user.create({ data: { username: `otp-${tag}`, email: `otp-${tag}@example.com`, fullName: "OTP IT", passwordHash: "x" } });
    user = { id: u.id, email: u.email! };
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("password-only is not enough: an unverified challenge yields no login", async () => {
    const c = await otp.createChallenge(user, "1.1.1.1");
    expect(await otp.consumeVerifiedChallenge(c.challengeId)).toBeNull();
  });

  it("correct code gives exactly one login, even under parallel attempts", async () => {
    const c = await otp.createChallenge(user, "1.1.1.1");
    await otp.verifyChallenge(c.challengeId, code(), "1.1.1.1");
    const results = await Promise.all([otp.consumeVerifiedChallenge(c.challengeId), otp.consumeVerifiedChallenge(c.challengeId), otp.consumeVerifiedChallenge(c.challengeId)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("five wrong guesses kill the challenge, even if guesses run in parallel", async () => {
    const c = await otp.createChallenge(user, "1.1.1.1");
    const good = code();
    const bad = good === "000000" ? "111111" : "000000";
    const tries = await Promise.allSettled(Array.from({ length: 12 }, () => otp.verifyChallenge(c.challengeId, bad, "1.1.1.1")));
    expect(tries.every((t) => t.status === "rejected")).toBe(true);
    await expect(otp.verifyChallenge(c.challengeId, good, "1.1.1.1")).rejects.toThrow();
    expect(await otp.consumeVerifiedChallenge(c.challengeId)).toBeNull();
  });
});
