# FBM Labor & Task-Based Salary Management System

A web application for **FBM**, a surf manufacturing company, to manage factory workers, their daily
production tasks, attendance, task-based earnings, daily extra allowances, and (in the next phases)
irregular salary payments, advances, and reports.

> **This is not an hourly payroll system.** Workers are paid for the tasks they complete. Each task has
> one standard rate, a worker can do several tasks in a day, and FBM may pay after 15 days, 25 days,
> a month, or any other irregular period.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748)
![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)

---

## Table of contents

1. [Project status](#project-status)
2. [Features](#features)
3. [Business rules the system enforces](#business-rules-the-system-enforces)
4. [Tech stack](#tech-stack)
5. [Getting started](#getting-started)
6. [Environment variables](#environment-variables)
7. [Daily workflow (user guide)](#daily-workflow-user-guide)
8. [Scripts](#scripts)
9. [Project structure](#project-structure)
10. [Architecture overview](#architecture-overview)
11. [Security](#security)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)
14. [Roadmap](#roadmap)
15. [Documentation](#documentation)

---

## Project status

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, database design, financial logic design | Done |
| 2 | Project setup, authentication, app shell, audit log | Done |
| 3 | Workers, tasks and rates, attendance, daily work entry, daily allowances | **Done** |
| 4 | Salary settlements, oldest-first payments, advances and recovery | Next |
| 5 | Dashboard analytics and reports (print, Excel, PDF) | Planned |
| 6 | Security hardening, integration tests, backups | Planned |
| 7 | Production deployment, PWA | Planned |

The salary, advances, and reports screens appear in the menu as placeholders until their phase is built.

## Features

**Available now (Phases 2 and 3)**

- **One secure manager account** (the administrator). Mandatory login, argon2id password hashing,
  account lockout, session expiry, forced password change on first login, full audit log.
- **Workers:** add, edit, search, filter, activate/deactivate (history is never deleted), and a full
  profile with attendance, production history, allowances, and balance summary.
- **Tasks and rates:** per-unit and fixed-per-task pricing, effective-dated rate history. Changing a rate
  never changes past entries.
- **Attendance:** present / absent / leave, one record per worker per day, fast bulk entry, audited corrections.
  Attendance never creates wages.
- **Daily work entry:** multiple workers, multiple tasks per worker, live amount preview, server-side
  calculation, **Save & approve** or **Save as draft**, bulk "approve all drafts", correction and voiding with
  reasons.
- **Daily extra allowance:** a discretionary amount per worker per day (for example machine breakdown),
  may be zero, never automatic, kept separate from task earnings.
- **Earnings ledger:** every approved entry and allowance creates exactly one ledger row, the source of truth
  for what each worker has earned.
- **Dashboard:** active workers, today's attendance, wages earned this month split into task earnings and allowances.
- **Responsive and touch-friendly:** sidebar on desktop, drawer on phones, card layouts on small screens.

**Coming next:** salary settlements with oldest-first allocation and partial payments (Phase 4), advances and
recovery (Phase 4), reports and exports (Phase 5).

## Business rules the system enforces

1. Workers are paid by completed tasks, not by the hour.
2. Each task has one standard rate for all workers, either **per unit** (quantity x rate) or **fixed per completed task**.
3. **Historical rates never change.** Each work entry stores the rate that was applied when it was recorded;
   rate history is append-only with effective dates, and a backdated entry uses the rate in effect on its work date.
4. **Daily allowances are discretionary,** entered separately, can be zero, and are never awarded because of attendance.
5. **Attendance is independent of production.** A worker can be present with no tasks completed.
6. Only **approved** entries create earnings. Drafts and voided entries never do.
7. Approved entries are **immutable.** A correction voids the old entry (reversing its earning) and creates a replacement,
   with a reason and an audit record.
8. A correction is **blocked** if any part of that earning was already paid or recovered; reverse the settlement first.
9. Money uses exact decimals (PostgreSQL `NUMERIC(14,2)` and decimal.js), never floating point.
10. Calculations are done on the **server.** The amount preview in the browser is only a convenience.
11. Daily records cannot be entered for a **future date**; dates use Pakistan time (Asia/Karachi).
12. Salary rules (implemented in Phase 4): payments go to the **oldest unpaid earnings first** within the manager-selected
    period; partial payments are supported; advances are separate from wages and recovered only when the manager explicitly chooses.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| UI | Tailwind CSS 3, shadcn/ui-style components (Radix primitives), lucide-react icons |
| Forms and tables | React Hook Form, Zod, TanStack Table |
| Backend | Next.js Server Actions and server-side services |
| Database | PostgreSQL 16 with Prisma ORM |
| Authentication | Auth.js v5 (Credentials, JWT sessions), argon2id (`@node-rs/argon2`) |
| Money | decimal.js and PostgreSQL `NUMERIC` |
| Testing | Vitest |

## Getting started

### Prerequisites

- **Node.js 20 or newer** and npm
- **Docker** (for the local PostgreSQL database), or any PostgreSQL 14+ server you can connect to
- Git

### 1. Clone and install

```bash
git clone <your-repository-url>
cd <repository-folder>
npm install
```

`npm install` also generates the Prisma client.

### 2. Configure the environment

```bash
cp .env.example .env
```

Open `.env` and set, at minimum:

- `AUTH_SECRET`: generate with `openssl rand -base64 32`
- `SEED_MANAGER_PASSWORD`: the manager's first password (at least 10 characters, letters and numbers)

**Never commit `.env`.** It is already listed in `.gitignore`.

### 3. Start the database

```bash
npm run db:up        # starts PostgreSQL 16 in Docker (port 5432)
```

### 4. Create the tables (first time only)

```bash
npm run db:init
```

This generates the migration from `prisma/schema.prisma`, appends the financial integrity rules from
`prisma/sql/financial_constraints.sql` (CHECK constraints, unique indexes, append-only triggers), and applies it.
After this first run, use `npm run db:migrate` for schema changes and `npm run db:deploy` on servers.

### 5. Create the manager account

```bash
npm run db:seed
```

### 6. Run the app

```bash
npm run dev
```

Open <http://localhost:3000> and sign in with the username and password from your `.env`
(default username: `manager`). You will be asked to choose a new password, then sign in again.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. The default matches `docker-compose.yml`. |
| `AUTH_SECRET` | Yes | Secret that signs session cookies. Use a long random value; keep it private. |
| `AUTH_TRUST_HOST` | Production | Set to `true` behind a reverse proxy or on a real domain. |
| `SEED_MANAGER_USERNAME` | Seed only | Username of the manager account (default `manager`). |
| `SEED_MANAGER_NAME` | Seed only | Display name (default `Manager`). |
| `SEED_MANAGER_PASSWORD` | Seed only | Initial password. Must be changed at first login. |
| `SESSION_IDLE_MINUTES` | No | Sign out after this much inactivity (default 30). |
| `SESSION_ABSOLUTE_HOURS` | No | Maximum session length regardless of activity (default 8). |

## Daily workflow (user guide)

**One-time setup**

1. **Tasks & Rates:** add each task (for example *Stitching, per unit, Rs. 50*) with the date its rate starts.
2. **Workers:** add each worker. The worker code is generated automatically (`W-0001`, `W-0002`, ...).

**Every day**

1. **Attendance:** pick the date, tap Present / Absent / Leave for each worker (or "Mark unmarked as Present"), save.
2. **Daily Work Entry:** pick the date, add a line for each worker and task with the quantity, then press
   **Save & approve**. The server calculates the amount from the rate in effect on that date.
   Use **Save as draft** if you are not sure yet, and **Approve all drafts** later.
3. **Daily Allowances:** where a worker lost production time (machine breakdown and so on), enter the extra
   amount and an optional reason. Leave blank for none.

**Fixing mistakes**

- Wrong quantity: press **Correct** on the entry, enter the new quantity and a reason.
- Wrong worker or task: press **Void** with a reason and re-enter it.
- Wrong allowance: enter the right amount (or 0 to cancel) and save.
- Nothing is silently overwritten: every change is recorded in the audit log with who, when, and before/after values.
- If the money was already paid for that day, the system asks you to reverse that salary payment first (Phase 4).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Run the unit tests |
| `npm run typecheck` | Strict TypeScript check |
| `npm run db:up` | Start PostgreSQL in Docker |
| `npm run db:init` | First-time database creation (schema + financial constraints) |
| `npm run db:migrate` | Create and apply a new migration during development |
| `npm run db:deploy` | Apply existing migrations (servers/production) |
| `npm run db:seed` | Create or sync the manager role and account |
| `npm run db:studio` | Open Prisma Studio to browse data |

## Project structure

```
prisma/
  schema.prisma                 Database schema (money is NUMERIC(14,2))
  sql/financial_constraints.sql CHECKs, partial unique indexes, immutability triggers
  seed.ts                       Roles, permissions, manager account
scripts/init-db.mjs             One-time database bootstrap
docs/01-architecture.md         Architecture, ER diagram, financial design
src/
  app/
    (auth)/login/               Sign-in page
    change-password/            Password change (also forced on first login)
    (app)/                      Authenticated area
      dashboard/ workers/ tasks/ attendance/ work-entry/ allowances/
      [section]/                Placeholders for Phase 4+ modules
    actions/                    Server Actions (thin: validate, authorize, call a service)
  server/
    auth/                       Auth.js config, argon2id, lockout, current user
    authz/                      Permission codes, requirePermission()
    services/                   Business logic: workers, tasks, rates, attendance,
                                work entries, allowances, earnings ledger, audit, pricing
    money/decimal.ts            Exact money math and PKR formatting
  components/                   UI primitives, layout shell, shared widgets
  lib/                          Dates (Asia/Karachi), validators (Zod), navigation
tests/                          Unit tests
```

## Architecture overview

- **One Next.js application and one PostgreSQL database.** No microservices.
- **Layering:** UI components never touch the database. Server Actions only validate input (Zod), check
  permission, and call a **service**. Services contain all business logic and are the only code that writes
  financial tables.
- **Earnings ledger:** every approved work entry or allowance with an amount above zero creates exactly one
  `earnings` row (enforced by unique columns). Earnings are never edited or deleted; corrections are reversals
  plus replacements.
- **Transactions:** every multi-step change (entry plus earning plus audit row) runs in a single database
  transaction, so it fully succeeds or fully rolls back. Rows are locked (`SELECT ... FOR UPDATE`) where
  concurrent changes could conflict.
- **Database safety net:** even if application code had a bug, PostgreSQL rejects negative or zero amounts,
  duplicate active entries, over-settled earnings, and edits or deletes of audit/allocation history.

See [`docs/01-architecture.md`](docs/01-architecture.md) for the ER diagram and the full salary-settlement design.

## Security

- Mandatory authentication; middleware redirects visitors, and **every page and action re-checks authorization on the server**.
- Passwords hashed with **argon2id**; minimum length and common-password checks.
- Account lockout after 5 failed attempts (escalating), plus a per-IP rate limit; one generic error message so attackers cannot
  tell whether a username exists.
- Sessions: 30 minutes idle and 8 hours absolute by default; changing the password signs out all sessions.
- Security headers (CSP, X-Frame-Options, HSTS in production, and more).
- Append-only **audit log** for logins, worker and task changes, rate changes, attendance corrections, entries, allowances, voids.
- Known trade-offs: lockout can be abused to lock the manager out for a short time; the IP limiter trusts `X-Forwarded-For` and needs a
  reverse proxy that sets it; the CSP currently allows inline scripts needed by Next.js (nonce-based CSP is planned for Phase 6).

**Before going live:** change `AUTH_SECRET` and the manager password, serve only over HTTPS, and set up database backups.

## Testing

```bash
npm test             # 32 unit tests: money, pricing, rate history, dates, passwords, permissions
npm run typecheck
```

Database-backed integration tests (settlement concurrency, reversals) arrive with Phase 4 and Phase 6.

Manual smoke test after setup:

1. Sign in, change the password, sign in again.
2. Add a task (*Stitching, per unit, Rs. 50*) and a worker.
3. Mark attendance; enter 20 units of Stitching and **Save & approve**. The entry should show Rs. 1,000.
4. Change the Stitching rate to Rs. 60 effective today; the earlier entry must still show Rs. 50 per unit.
5. Add an allowance of Rs. 230. The dashboard should show task earnings and allowances separately.
6. Correct the quantity to 25; the old entry shows as Voided with its reason and a new approved entry appears.

## Troubleshooting

**Port 5432 is already in use.** Stop the other PostgreSQL or change the port mapping in `docker-compose.yml` and `DATABASE_URL`.

**`db:init` says migrations already exist.** It only runs on a fresh project. Use `npm run db:deploy` to apply existing migrations.

**I am locked out after failed logins.** Wait 15 minutes, or clear the lock:

```bash
docker compose exec db psql -U fbm -d fbm -c "UPDATE users SET \"failedLoginCount\"=0, \"lockedUntil\"=NULL WHERE username='manager';"
```

**I forgot the manager password (development).** Delete the user row and re-run the seed:

```bash
docker compose exec db psql -U fbm -d fbm -c "DELETE FROM users WHERE username='manager';"
npm run db:seed
```

**Start completely fresh (this deletes ALL data).**

```bash
docker compose down -v
rm -rf prisma/migrations
npm run db:up && npm run db:init && npm run db:seed
```

**Upgrading from the Phase 2 build.** The database schema did not change. Run `npm run db:seed` once to retire the old ADMIN and
VIEWER roles; any old `admin` account is moved to the manager role, so delete it if you do not need it.

## Roadmap

- [x] Phase 1: Architecture and database design
- [x] Phase 2: Setup, authentication, app shell, audit log
- [x] Phase 3: Workers, tasks and rates, attendance, work entry, allowances
- [ ] Phase 4: Salary settlements (oldest-first, partial payments, reversals), advances and recovery
- [ ] Phase 5: Dashboard analytics, reports (monthly wage, worker statement, attendance, production, outstanding, advances), print/Excel/PDF
- [ ] Phase 6: Hardening: integration and concurrency tests, nonce-based CSP, backups
- [ ] Phase 7: Production deployment (Docker, HTTPS, scheduled backups) and PWA install

## Documentation

- [`docs/01-architecture.md`](docs/01-architecture.md): architecture proposal, ER diagram, salary calculation logic,
  service breakdown, authentication design, database integrity rules, roadmap.

## License

Private project for FBM. All rights reserved.
