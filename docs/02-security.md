# Security overview (Phase 6)

FBM handles wages and cash advances for real people, so the system is designed so that mistakes and attacks are
caught by several independent layers, not by one check.

## Layers of protection

| Threat | Control | Where | Verified by |
|---|---|---|---|
| Someone opens the app without logging in | Middleware redirects to `/login`; every page, action and download re-checks the session on the server | `src/middleware.ts`, `src/server/authz/require.ts` | `tests/security/static-guards.test.ts`, `authz-runtime.test.ts` |
| A user does something they are not allowed to | Permission codes checked inside every Server Action, page, and Route Handler (hiding buttons is only cosmetic) | `src/server/authz/*` | Static test fails the build if any action or page lacks a check |
| Password guessing | argon2id hashing, 5-strike escalating lockout, per-IP limiter, one generic error, equal timing for unknown users | `src/server/auth/*` | `tests/password.test.ts` |
| Stolen or stale session | JWT cookie (httpOnly, SameSite=Lax, Secure in production), 30 min idle / 8 h absolute, `sessionVersion` revokes all sessions on password change or deactivation | `src/server/auth/*` | Manual checklist in README |
| Cross-site scripting | Nonce-based Content-Security-Policy (no inline scripts), React escaping, no `dangerouslySetInnerHTML`/`eval` | `src/lib/csp.ts`, `src/middleware.ts` | `tests/security/csp.test.ts`, live header check, static scan |
| Clickjacking, MIME sniffing, referrer leaks | `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS in production | `next.config.ts`, CSP | Live header check |
| Cross-site request forgery | Server Actions' built-in Origin check; downloads are read-only GET behind the session | Next.js | - |
| SQL injection | Prisma parameterised queries; the only raw SQL uses tagged templates (parameterised); `$queryRawUnsafe` is banned by a test | services | Static scan |
| Server code or secrets reaching the browser | Client components may not import database, auth, or service code | all `"use client"` files | `static-guards.test.ts` |
| Double payment (double-click, retry, two tabs) | Idempotency key + per-worker row lock + re-check under lock | `settlement.service.ts` | `tests/integration/settlement.int.test.ts` |
| Over-settling or negative money | Server validation, then database CHECK constraints | `prisma/sql/financial_constraints.sql` | `tests/integration/security.int.test.ts` |
| Editing or deleting financial history | Triggers reject changes to audit log, allocations, recoveries, earning amounts, payment amounts | same SQL file | `security.int.test.ts` |
| Silent drift or tampering | Integrity checks recompute balances from history and compare (Audit Log page, `npm run db:reconcile`) | `reconcile.service.ts` | `security.int.test.ts` |
| Data loss | Verified backups and a tested restore procedure | `scripts/backup.mjs`, `scripts/restore.mjs` | `docs/03-operations.md` drill |
| Vulnerable libraries | `npm audit` clean; overrides documented below | `package.json` | `npm audit --omit=dev` |
| Error details leaking | Users see generic messages plus a reference; details go to the server log only | `action-result.ts`, `error.tsx` | `authz-runtime.test.ts` |
| Export abuse | Export permission, 30 exports per minute per user, each export audited | export route | static test |

## Dependency overrides

`package.json` pins three transitive dependencies to patched versions so `npm audit` reports 0 issues without a breaking
framework upgrade:

- `postcss` (inside Next.js, build-time CSS only),
- `uuid` (used by the Excel library),
- `deepmerge-ts` (used by the Prisma command-line tool).

Re-run `npm audit` after each upgrade. Remove an override once the parent package ships the fix itself.

## Known limitations (accepted)

- **One account.** There is no second person to approve payments. The audit log, reversal workflow, and integrity check are
  the safeguards; review the Audit Log periodically.
- **Lockout can be abused** to lock the manager out for a short time. Escalation is capped at 4 hours.
- **Login rate limiter is in memory** and trusts `X-Forwarded-For`; it only works as intended behind a reverse proxy that
  sets that header, on a single instance.
- **Styles allow `'unsafe-inline'`** because React, Tailwind and the charts emit inline style attributes. Inline styles cannot run code.
- **JWT sessions cannot be revoked individually**; they are revoked as a group by `sessionVersion`.
- **No two-factor authentication** in this version.

## Before going live (checklist)

- [ ] `AUTH_SECRET` is a fresh random value and is not in Git.
- [ ] The manager password has been changed from the seed value.
- [ ] The site is served over HTTPS only; `AUTH_TRUST_HOST=true` is set behind the proxy.
- [ ] The database is not reachable from the internet (firewall; strong password; not the dev password).
- [ ] A backup has run, been copied off the machine, and a test restore has succeeded.
- [ ] `npm audit --omit=dev` shows no high issues; `npm test` and `npm run typecheck` pass.
- [ ] `npm run db:reconcile` passes.
