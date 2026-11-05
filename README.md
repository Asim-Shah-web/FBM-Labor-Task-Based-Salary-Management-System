# FBM Labor & Task-Based Salary System

**Phase 2 (project setup)**: Next.js 15 + TypeScript + Tailwind + Prisma/PostgreSQL + Auth.js,
a responsive app shell, RBAC, audit service and money helpers. Business modules start in Phase 3.
Design documents: `docs/01-architecture.md`.

## What is in this phase

| Area | Where | Notes |
|---|---|---|
| Schema | `prisma/schema.prisma` | 20 models; money is `Decimal(14,2)` |
| DB integrity | `prisma/sql/financial_constraints.sql` | CHECKs, partial unique indexes, immutability triggers, append-only audit log |
| DB bootstrap | `scripts/init-db.mjs`, `prisma/seed.ts` | One migration = generated schema + constraints. Seed creates roles, permissions, first users |
| Auth | `src/server/auth/*` | Auth.js v5 Credentials, argon2id, 5-strike lockout (escalating), per-IP limiter, session version, 30 min idle / 8 h absolute |
| Authorization | `src/server/authz/*` | Permission codes, role map, `requirePermission()` / `requirePagePermission()` |
| Audit | `src/server/services/audit.service.ts` | Accepts a transaction client so audit rows commit with the change |
| Money | `src/server/money/decimal.ts` | Decimal-only math, half-up rounding, PKR format/parse |
| UI shell | `src/components/layout/app-shell.tsx` | Sidebar on desktop, drawer on phones, 44px touch targets |
| Pages | `login`, `change-password`, `dashboard`, placeholders | Placeholders still enforce permissions |
| Tests | `tests/*.test.ts` | 15 unit tests (money, permissions, password) |

Roles seeded: **ADMIN** (everything), **MANAGER** (all daily operations), **VIEWER** (read-only).

## Run it

Prerequisites: Node 20+, Docker (for PostgreSQL), npm.

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # then edit .env:
#   AUTH_SECRET  -> output of: openssl rand -base64 32
#   SEED_*       -> real initial passwords (min 10 chars, letters + numbers)
npm run db:up                    # starts PostgreSQL 16 in Docker
npm run db:init                  # creates + applies the migration (schema + financial constraints)
npm run db:seed                  # roles, permissions, admin + manager users
npm run dev                      # http://localhost:3000
```

Sign in as `manager` (or `admin`) with the seed password. You are forced to change it on first login,
then signed out and asked to sign in again with the new one.

`db:init` is for a **fresh project only**. Afterwards, schema changes use `npm run db:migrate`,
and servers apply migrations with `npm run db:deploy`.

## Test it

```bash
npm test            # 15 unit tests
npm run typecheck   # strict TypeScript (run after `npm install` so the Prisma client exists)
```

Manual checklist:

1. Open `/dashboard` while signed out -> redirected to `/login`.
2. Wrong password 5 times for `manager` -> 6th attempt fails even with the right password (15 min lock). Message is always the same generic text. Reset with Prisma Studio (`npm run db:studio`): set `failedLoginCount = 0`, `lockedUntil = null`.
3. First login forces **Change password**; afterwards the old session is invalid (sessionVersion bumped).
4. Set `SEED_VIEWER_PASSWORD` in `.env`, rerun `npm run db:seed`, sign in as `viewer`: the menu shows no Users/Settings and no write actions; visiting `/users` redirects to the dashboard with a notice.
5. Deactivate a user in Prisma Studio (`isActive = false`) -> their next request sends them to `/login`.
6. Narrow the browser below 1024 px: sidebar becomes a drawer behind the menu button.
7. Check the `audit_logs` table: login, failed login, lock, logout, password change entries exist.
8. Constraint check in `psql`: `UPDATE audit_logs SET action='x';` must fail ("financial history is immutable").

## Security notes / known trade-offs

- **Account lockout can be abused** to lock a legitimate user out (denial of service). Accepted for an internal tool; the Admin can clear it, and lock time is short.
- The per-IP limiter reads `X-Forwarded-For`; it is only meaningful behind a reverse proxy that sets that header. It is in-memory (single instance).
- CSP currently allows `'unsafe-inline'` scripts (Next.js hydration). Nonce-based CSP is planned for Phase 6.
- Middleware only checks that a session cookie exists. **Real authorization is server-side** in every page/action.
- Change `AUTH_SECRET` and all seed passwords before any real deployment; never commit `.env`.

## Layout

```
prisma/            schema.prisma, seed.ts, sql/financial_constraints.sql
scripts/init-db.mjs
src/app/           (auth)/login, change-password, (app)/dashboard + placeholders, actions/auth.ts
src/server/        auth/, authz/, db/, money/, services/
src/components/    ui/ (shadcn-style), layout/app-shell.tsx
tests/
docs/01-architecture.md
```

## Next: Phase 3

Workers, tasks and rate history, attendance (single + bulk), daily work entry (Save & Approve / draft / approve day), daily allowances.
