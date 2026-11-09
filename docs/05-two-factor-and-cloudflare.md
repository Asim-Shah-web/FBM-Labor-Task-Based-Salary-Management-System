# Two-step login (emailed code) and Cloudflare

## 1. How signing in works now

```
1. Username + password (+ Cloudflare Turnstile check)      -> password is checked, NO session yet
2. A 6-digit code is emailed to the manager's Gmail         -> valid 10 minutes, one use, 5 guesses
3. Manager types the code                                   -> only now is the session created
```

A password on its own can never open the system, even if it is stolen, guessed, or reused from another site.
This is enforced on the server (`src/server/auth/auth.ts` only accepts a challenge whose code was verified) and a test
fails the build if anyone adds a password-only path.

| Protection | Value |
|---|---|
| Code | 6 random digits, stored only as an HMAC, never logged, never sent back to the browser |
| Lifetime | 10 minutes, single use |
| Wrong guesses | 5 per sign-in (resending does not reset the counter), then the sign-in is cancelled |
| Resend | every 30 seconds, at most 5 codes per sign-in; the old code stops working |
| New sign-in | cancels any earlier unfinished one; at most 10 per hour |
| Email contents | the code, the requesting IP, the time, and a warning to change the password if it was not you |
| Audit log | `auth.password_ok`, `auth.otp.sent`, `auth.otp.verified`, `auth.otp.failed`, `auth.otp.locked`, `auth.login` |

## 2. Set up the email (Gmail)

The app sends the code through Gmail's SMTP server using an **App Password** (not your normal Gmail password).

1. Choose the Google account that will **send** the codes. It can be the manager's own Gmail or a separate one.
2. Turn on **2-Step Verification** for that account (Google requires it for App Passwords): <https://myaccount.google.com/security>.
3. Create an App Password: <https://myaccount.google.com/apppasswords>. Name it "FBM Labor" and copy the 16 characters.
4. Put these in `.env`:
   ```env
   SEED_MANAGER_EMAIL="manager@gmail.com"      # where the codes are delivered
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="465"
   SMTP_USER="sending-account@gmail.com"
   SMTP_PASSWORD="abcd efgh ijkl mnop"         # the App Password
   MAIL_FROM="FBM Labor <sending-account@gmail.com>"
   ```
5. Restart the app. Sign in: the code arrives in the manager's inbox (check Spam the first time).

**Development without email:** leave the `SMTP_*` values empty. The code is then printed in the server console
(`DEV MODE: SMTP not configured ...`). This is refused in production: with no SMTP settings the login fails instead of
silently skipping the second step.

**Other providers** work too (Brevo, Resend SMTP, Zoho, your hosting provider): just set the `SMTP_*` values.

### Keep the mailbox safe

The second step is only as strong as the mailbox that receives it. Whoever can read the manager's Gmail can read the code.
Turn on 2-Step Verification (ideally with a passkey or authenticator app) on that Gmail account, and do not reuse its password.

### Changing the email address or recovering access

If the manager loses access to the Gmail, a person with access to the server can set a new address (this signs out all sessions
and is written to the audit log):

```bash
SEED_MANAGER_EMAIL="new-address@gmail.com" npm run db:seed
```

(The seed only changes the email of an existing account; it never changes the password.)

## 3. Other authentication methods worth considering

| Method | Strength | Cost / effort | Notes |
|---|---|---|---|
| **Emailed code** (built) | Good | Needs email working | Weakness: depends on the mailbox security and on email delivery |
| **Authenticator app** (Google Authenticator, Microsoft Authenticator, Aegis) | Better | Free; one-time QR scan | Works offline, not tied to email, no delivery delay. **Recommended as the next step**, or to replace the email code |
| **Passkey / security key** (WebAuthn: fingerprint, face, YubiKey) | Best | Free (phone or laptop) or about $25 for a key | Resistant to phishing; needs a one-time enrolment screen |
| **Cloudflare Access** in front of the whole site | Very good | Free for up to 50 users | Visitors must pass Google login or an emailed PIN **before they can even load the login page**. Excellent extra layer (see below) |
| SMS codes | Weak | Costs money | Not recommended (SIM-swap attacks) |

Suggested combination for FBM: **password + emailed code (now) + Cloudflare Turnstile + Cloudflare Access restricted to the
manager's Gmail**. If you later want to remove the email dependency, add an authenticator app and let me know.

## 4. Cloudflare

Cloudflare gives three separate benefits. Use any or all.

### 4.1 Turnstile (bot check on the login form), free

1. Cloudflare dashboard > **Turnstile** > Add widget. Domain: your site's domain (add `localhost` for testing). Mode: Managed.
2. Copy the **Site key** and **Secret key** into `.env`:
   ```env
   NEXT_PUBLIC_TURNSTILE_SITE_KEY="0x4AAAA..."
   TURNSTILE_SECRET_KEY="0x4AAAA..."
   ```
3. **Rebuild** (`npm run build`), because `NEXT_PUBLIC_` values are baked into the build. The login page now shows a small check and the
   Continue button stays disabled until it passes. The server verifies the token with Cloudflare; if Cloudflare cannot be reached,
   login is refused (fail closed). To switch the check off in an emergency, empty both keys and restart.
4. For local testing Cloudflare provides test keys: site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`.

### 4.2 Cloudflare Tunnel (no open ports, hides your server), free

A tunnel lets Cloudflare reach your app **from the inside**, so the server needs no public IP or open firewall port, and
nobody can bypass Cloudflare by attacking the server directly.

1. Cloudflare dashboard > **Zero Trust > Networks > Tunnels** > Create a tunnel (Cloudflared). Copy the **tunnel token**.
2. Add a **Public hostname**: for example `fbm.yourdomain.com`, service type **HTTP**, URL `host.docker.internal:3000`
   (or `localhost:3000` if you run `cloudflared` directly on the server).
3. Put the token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN` and start the connector:
   ```bash
   docker compose --profile cloudflare up -d cloudflared
   ```
4. In `.env` set `TRUST_CLOUDFLARE="true"` and `AUTH_URL="https://fbm.yourdomain.com"`. **Only do this if the app is reachable
   solely through the tunnel** (do not also expose port 3000 to the internet). Then login rate limiting and the audit log record the
   visitor's real IP instead of Cloudflare's.
5. Cloudflare **SSL/TLS** mode: Full (strict); turn on **Always Use HTTPS**.

If you cannot use a tunnel and instead point DNS at your server (orange cloud proxy), configure your firewall to accept
ports 80/443 **only from Cloudflare's published IP ranges** (<https://www.cloudflare.com/ips/>), otherwise `TRUST_CLOUDFLARE`
must stay `false`.

### 4.3 Cloudflare Access (login gate in front of the website), free for up to 50 users

1. Zero Trust > **Access > Applications** > Add > Self-hosted. Application domain: `fbm.yourdomain.com`.
2. Policy: **Allow** > Include > *Emails* > the manager's Gmail address. Authentication: **One-time PIN** (emailed code) or
   **Google** sign-in.
3. Result: anyone else gets a Cloudflare page and never reaches your application at all; the manager first passes Cloudflare,
   then the app's own password + emailed code. Two independent gates.

### 4.4 Extra Cloudflare settings (dashboard)

- **Security > WAF > Rate limiting rules:** for the path `/login` allow about 20 requests per minute per IP, then block or challenge.
- **Security > Bots:** enable *Bot Fight Mode*.
- **SSL/TLS > Edge certificates:** enable HSTS after confirming HTTPS works.

## 5. Troubleshooting

| Problem | What to do |
|---|---|
| No email arrives | Check Spam. Look at the server log for `Email sending failed`. Confirm 2-Step Verification is on for the sending account and the App Password is typed without extra characters. Port 465 must be reachable from the server |
| "The login code could not be emailed because email is not set up" | `SMTP_*` values are missing in production |
| "No email address is set for this account" | Run `SEED_MANAGER_EMAIL="you@gmail.com" npm run db:seed` |
| "The security check failed" | Cloudflare could not verify the browser. Wait and retry; check the keys and domain in the Turnstile widget; ad blockers sometimes block it |
| Code says expired | Codes last 10 minutes. Go back, sign in again, and use the newest email |
| Locked out after wrong codes | The sign-in is cancelled after 5 wrong codes. Sign in again to get a new code |
| Cannot sign in at all and cannot read the Gmail | Use the recovery command in section 2 from the server |
