// Cloudflare Turnstile: a privacy-friendly, mostly invisible bot check on the login form.
// Enabled when TURNSTILE_SECRET_KEY (server) and NEXT_PUBLIC_TURNSTILE_SITE_KEY (browser) are set.
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const isTurnstileEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

/** Fails CLOSED: if Cloudflare cannot be reached the login is refused (unset the keys to disable the check). */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!isTurnstileEnabled()) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
