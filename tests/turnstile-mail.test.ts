import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { verifyTurnstile } from "@/server/auth/turnstile";
import { getClientIp } from "@/server/auth/ip";
import { loginCodeEmail } from "@/server/mail/templates";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

describe("Cloudflare Turnstile verification", () => {
  it("is skipped when not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(await verifyTurnstile(undefined, "1.1.1.1")).toBe(true);
  });
  describe("when configured", () => {
    beforeEach(() => { process.env.TURNSTILE_SECRET_KEY = "secret"; });
    it("rejects a missing token without calling Cloudflare", async () => {
      const f = vi.spyOn(globalThis, "fetch");
      expect(await verifyTurnstile(undefined, "1.1.1.1")).toBe(false);
      expect(f).not.toHaveBeenCalled();
    });
    it("accepts a token Cloudflare approves, sending secret, token and IP", async () => {
      const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
      expect(await verifyTurnstile("tok", "9.9.9.9")).toBe(true);
      const body = (f.mock.calls[0]![1] as RequestInit).body as URLSearchParams;
      expect(body.get("secret")).toBe("secret"); expect(body.get("response")).toBe("tok"); expect(body.get("remoteip")).toBe("9.9.9.9");
    });
    it("rejects a token Cloudflare refuses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: false })));
      expect(await verifyTurnstile("bad", "9.9.9.9")).toBe(false);
    });
    it("fails closed if Cloudflare cannot be reached", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
      expect(await verifyTurnstile("tok", "9.9.9.9")).toBe(false);
    });
  });
});

describe("client IP", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("uses X-Forwarded-For by default and ignores a forged Cloudflare header", () => {
    delete process.env.TRUST_CLOUDFLARE;
    expect(getClientIp(h({ "x-forwarded-for": "5.5.5.5, 10.0.0.1", "cf-connecting-ip": "6.6.6.6" }))).toBe("5.5.5.5");
  });
  it("uses CF-Connecting-IP only when Cloudflare is trusted", () => {
    process.env.TRUST_CLOUDFLARE = "true";
    expect(getClientIp(h({ "x-forwarded-for": "5.5.5.5", "cf-connecting-ip": "6.6.6.6" }))).toBe("6.6.6.6");
  });
  it("falls back to 'unknown'", () => expect(getClientIp(h({}))).toBe("unknown"));
});

describe("login code email", () => {
  it("builds a clear message with the code, expiry and a warning", async () => {
    const m = loginCodeEmail({ code: "042917", minutes: 10, ip: "1.2.3.4", when: new Date("2026-11-07T10:00:00Z") });
    expect(m.text).toContain("code is: 042917");
    expect(m.text).toContain("10 minutes");
    expect(m.text).toContain("Change your password");
    expect(m.html).toContain("042917");
    expect(m.subject).not.toContain("042917"); // keep the code out of notification previews
  });
  it("escapes HTML in the IP field", () => {
    expect(loginCodeEmail({ code: "111111", minutes: 10, ip: "<script>x</script>" }).html).not.toContain("<script>x");
  });
  it("is deliverable through an SMTP transport (offline JSON transport)", async () => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const info = await t.sendMail({ from: "a@b.c", to: "manager@gmail.com", ...loginCodeEmail({ code: "123456", minutes: 10, ip: "x" }) });
    const sent = JSON.parse(info.message as string);
    expect(sent.to[0].address).toBe("manager@gmail.com");
    expect(sent.text).toContain("123456");
  });
});
