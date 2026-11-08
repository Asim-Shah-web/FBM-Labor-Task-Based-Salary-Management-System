import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "@/lib/csp";

describe("Content-Security-Policy", () => {
  const nonce = generateNonce();
  const prod = buildCsp(nonce, false);
  const dev = buildCsp(nonce, true);

  it("generates unique, base64 nonces of sufficient length", () => {
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateNonce()).not.toBe(generateNonce());
  });
  it("allows scripts only with the nonce (no unsafe-inline in script-src)", () => {
    const script = prod.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toContain(`'nonce-${nonce}'`);
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
  });
  it("allows unsafe-eval only in development", () => {
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("unsafe-eval");
  });
  it("blocks framing, plugins, foreign form posts and foreign connections", () => {
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "form-action 'self'", "base-uri 'self'", "connect-src 'self'", "default-src 'self'"])
      expect(prod).toContain(d);
  });
  it("upgrades insecure requests in production only", () => {
    expect(prod).toContain("upgrade-insecure-requests");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});
