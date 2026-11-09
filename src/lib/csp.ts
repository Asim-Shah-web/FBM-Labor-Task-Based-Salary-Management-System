// Content-Security-Policy with a per-request nonce (edge-safe, pure).
// Scripts run only if they carry the nonce ('strict-dynamic' lets Next.js load its own chunks).
// Styles still allow 'unsafe-inline' because React/Tailwind/Recharts emit inline style attributes;
// inline *styles* cannot execute code, so this is a much smaller risk than inline scripts.

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function buildCsp(nonce: string, isDev: boolean, opts: { turnstile?: boolean } = {}): string {
  const cf = opts.turnstile ? " https://challenges.cloudflare.com" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${cf}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${cf}`,
    ...(opts.turnstile ? ["frame-src https://challenges.cloudflare.com"] : []),
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
