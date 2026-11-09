/**
 * The visitor's IP address, used for rate limiting and the audit log.
 * Behind Cloudflare set TRUST_CLOUDFLARE=true to use Cloudflare's CF-Connecting-IP header. Only do that when
 * the server is reachable ONLY through Cloudflare (Tunnel, or a firewall allowing just Cloudflare), otherwise
 * anyone could forge the header. Without it we use the first X-Forwarded-For entry (set by your reverse proxy).
 */
export function getClientIp(h: Headers): string {
  if (process.env.TRUST_CLOUDFLARE === "true") {
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
  }
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}
