// Second login factor: a 6-digit one-time code emailed to the manager.
//
// Rules (all enforced here, on the server):
//  - A session is created ONLY from a challenge whose code was entered correctly (see auth.ts: authorize()).
//  - The code is random, stored only as an HMAC, expires in 10 minutes, and is single-use.
//  - At most 5 wrong guesses per challenge in total (resending does not reset the counter).
//  - Starting a new login cancels any earlier unfinished challenge for that user.
//  - Limits on resends, on challenges per hour, and on the e-mails an attacker can trigger.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { sendMail } from "@/server/mail/mailer";
import { loginCodeEmail } from "@/server/mail/templates";
import { audit } from "@/server/services/audit.service";

export const OTP = {
  ttlMinutes: 10,
  maxAttempts: 5,
  maxSends: 5,
  resendCooldownSeconds: 30,
  verifiedWindowSeconds: 60, // after the correct code, the session must be created within this time
  maxChallengesPerHour: 10,
} as const;

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
};

export const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const newChallengeId = (): string => randomBytes(32).toString("base64url");
export const hashCode = (challengeId: string, code: string): string =>
  createHmac("sha256", secret()).update(`${challengeId}:${code}`).digest("hex");

export function codesMatch(expectedHash: string, challengeId: string, code: string): boolean {
  const a = Buffer.from(expectedHash, "hex");
  const b = Buffer.from(hashCode(challengeId, code), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "manager@gmail.com" -> "m*****@gmail.com" */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

const EXPIRED = "This sign-in has expired. Please sign in again.";
const minutes = (n: number) => n * 60_000;

async function deliver(challengeId: string, email: string, code: string, ip: string) {
  const mail = loginCodeEmail({ code, minutes: OTP.ttlMinutes, ip });
  await sendMail({ to: email, ...mail });
}

/** Step 1 succeeded (password correct): create a challenge and email the code. */
export async function createChallenge(user: { id: string; email: string | null }, ip: string) {
  if (!user.email)
    throw new DomainError("NO_EMAIL", "No email address is set for this account, so the login code cannot be sent. See docs/05-two-factor-and-cloudflare.md.");

  const now = new Date();
  const recent = await prisma.loginChallenge.count({ where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - minutes(60)) } } });
  if (recent >= OTP.maxChallengesPerHour) {
    await audit({ userId: user.id, action: "auth.otp.rate_limited", meta: { ip } });
    throw new DomainError("TOO_MANY", "Too many sign-in attempts. Please wait a while before trying again.");
  }

  // Cancel earlier unfinished challenges; tidy up very old ones.
  await prisma.loginChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
  await prisma.loginChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - minutes(24 * 60)) } } });

  const id = newChallengeId();
  const code = generateCode();
  await prisma.loginChallenge.create({
    data: { id, userId: user.id, codeHash: hashCode(id, code), expiresAt: new Date(now.getTime() + minutes(OTP.ttlMinutes)), ip },
  });
  try {
    await deliver(id, user.email, code, ip);
  } catch (e) {
    await prisma.loginChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
    throw e;
  }
  await audit({ userId: user.id, action: "auth.otp.sent", meta: { ip } });
  return { challengeId: id, emailHint: maskEmail(user.email) };
}

export async function resendChallenge(challengeId: string, ip: string) {
  const c = await prisma.loginChallenge.findUnique({ where: { id: challengeId }, include: { user: { select: { email: true, isActive: true } } } });
  const now = new Date();
  if (!c || c.consumedAt || c.verifiedAt || c.expiresAt <= now || !c.user.isActive || !c.user.email) throw new DomainError("EXPIRED", EXPIRED);
  if (c.sends >= OTP.maxSends) throw new DomainError("TOO_MANY_SENDS", "No more codes can be sent for this sign-in. Please sign in again.");
  const wait = OTP.resendCooldownSeconds - Math.floor((now.getTime() - c.lastSentAt.getTime()) / 1000);
  if (wait > 0) throw new DomainError("COOLDOWN", `Please wait ${wait} seconds before asking for another code.`);

  const code = generateCode();
  await prisma.loginChallenge.update({
    where: { id: c.id },
    data: { codeHash: hashCode(c.id, code), sends: { increment: 1 }, lastSentAt: now, expiresAt: new Date(now.getTime() + minutes(OTP.ttlMinutes)) },
  });
  await deliver(c.id, c.user.email, code, ip);
  await audit({ userId: c.userId, action: "auth.otp.resent", meta: { ip, sends: c.sends + 1 } });
}

/** Checks the code. On success marks the challenge verified (the session is created in authorize()). */
export async function verifyChallenge(challengeId: string, rawCode: string, ip: string): Promise<void> {
  const code = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) throw new DomainError("BAD_FORMAT", "Enter the 6-digit code from your email.");

  const c = await prisma.loginChallenge.findUnique({ where: { id: challengeId } });
  const now = new Date();
  if (!c || c.consumedAt || c.verifiedAt) throw new DomainError("EXPIRED", EXPIRED);
  if (c.expiresAt <= now) {
    await prisma.loginChallenge.update({ where: { id: c.id }, data: { consumedAt: now } });
    throw new DomainError("EXPIRED", "That code has expired. Please sign in again to get a new one.");
  }

  // Count the guess BEFORE checking it, atomically, so parallel requests cannot get extra tries.
  const updated = await prisma.loginChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
  if (updated.attempts > OTP.maxAttempts) {
    await prisma.loginChallenge.update({ where: { id: c.id }, data: { consumedAt: now } });
    await audit({ userId: c.userId, action: "auth.otp.locked", meta: { ip } });
    throw new DomainError("LOCKED", "Too many incorrect codes. Please sign in again.");
  }

  if (!codesMatch(c.codeHash, c.id, code)) {
    const left = OTP.maxAttempts - updated.attempts;
    await audit({ userId: c.userId, action: "auth.otp.failed", meta: { ip, attempts: updated.attempts } });
    if (left <= 0) {
      await prisma.loginChallenge.update({ where: { id: c.id }, data: { consumedAt: now } });
      throw new DomainError("LOCKED", "Too many incorrect codes. Please sign in again.");
    }
    throw new DomainError("WRONG_CODE", `That code is incorrect. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }

  // Atomic: only one request can flip a challenge to verified.
  const done = await prisma.loginChallenge.updateMany({ where: { id: c.id, verifiedAt: null, consumedAt: null }, data: { verifiedAt: now } });
  if (done.count !== 1) throw new DomainError("EXPIRED", EXPIRED);
  await audit({ userId: c.userId, action: "auth.otp.verified", meta: { ip } });
}

/** Used by authorize(): turns a verified challenge into exactly one login (single use, short window). */
export async function consumeVerifiedChallenge(challengeId: string) {
  const now = new Date();
  const claimed = await prisma.loginChallenge.updateMany({
    where: { id: challengeId, consumedAt: null, verifiedAt: { gte: new Date(now.getTime() - OTP.verifiedWindowSeconds * 1000) }, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) return null;
  const c = await prisma.loginChallenge.findUnique({ where: { id: challengeId }, include: { user: true } });
  return c?.user ?? null;
}
