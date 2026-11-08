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
| 3 | Workers, tasks and rates, attendance, daily work entry, daily allowances | Done |
| 4 | Salary settlements, oldest-first payments, reversals, advances and recovery | Done |
| 5 | Dashboard analytics and reports (print, Excel, PDF) | Done |
| 6 | Security hardening, tests, backups, audit log, integrity checks | **Done** |
| 7 | Production deployment, PWA | Planned |

All modules and hardening are implemented. The remaining work is production deployment and the installable app (Phase 7).

## Features

**Available now (Phases 2 to 6)**

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
- **Salary settlements:** pick any work period, enter the cash paid, and the server applies it to the **oldest unpaid
  dates first**. Partial payments are supported; each date shows Paid / Partially Paid / Unpaid. Over-payment is blocked.
  Every payment keeps a permanent allocation record and a receipt number (`SP-2026-000001`).
- **Safe corrections:** a settlement is never edited or deleted. It can be **reversed** (with a reason) and re-recorded;
  the reversed payment stays on record.
- **Advances:** cash given before wages are earned, tracked separately from wages. Recovery happens only when the manager
  enters a recovery amount during a settlement; the system records exactly which earnings funded it.
- **Concurrency-safe:** row locks, an idempotency key (double-click safe), and database CHECK constraints make
  over-settling impossible even if two payments are submitted at the same moment.
- **Dashboard:** active workers, present and absent today, wages earned this month (task earnings and allowances),
  cash paid this month, outstanding wages, unrecovered advances, recent settlements and recent production, plus charts
  (wages earned vs cash paid for six months, daily task earnings). The money figures are never combined into one number.
- **Reports** (screen, print, Excel, PDF), filterable by worker, department, date range, month, and task:
  - **Monthly Wage Report:** task earnings, allowances, total earned, cash paid in the month, outstanding wages.
  - **Worker Salary Statement:** daily earnings, payment allocations, paid / partially paid / unpaid dates, advances, balance.
  - **Attendance Report:** present, absent, and leave days.
  - **Production Report:** task-wise, worker-wise, daily, and monthly totals.
  - **Outstanding Salary Report:** every unpaid work date with original, settled, and remaining amounts, as of any date.
  - **Advance Report:** advances issued, recovered, and outstanding, with the recovery history.
- **Responsive and touch-friendly:** sidebar on desktop, drawer on phones, card layouts on small screens.

- **Audit Log page:** search and filter every recorded action (who, when, before/after values). Entries cannot be edited or deleted.
- **Financial integrity check:** one click (or `npm run db:reconcile`) recomputes all balances from the permanent history and
  confirms they match; any difference is listed by record ID.
- **Backups:** `npm run db:backup` (verified, rotated) and `npm run db:restore` (safe test restore by default).
- **Hardening:** nonce-based Content-Security-Policy, automated checks that every action and page is permission-protected,
  safe error pages, a health endpoint, export rate limiting, and a clean dependency audit.

**Coming next:** production deployment (Docker, HTTPS, scheduled backups) and the installable app (Phase 7).

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
12. **Salary payments** go to the **oldest unpaid earnings first** within the manager-selected period. A date that is only
    partly paid stays partly outstanding; the whole period is never simply marked paid.
13. A payment can never exceed the outstanding wages of the selected period; extra money must be recorded as an advance.
14. **Advances are not wages.** They never create earnings, and they are recovered only when the manager enters a recovery
    amount in a settlement (oldest advance first). The same advance money can never be recovered twice.
15. **Cash paid** is reported by payment date and **wages earned** by work date, never mixed: a November payment for October
    work counts as November cash and October earnings.
16. Payment, allocation, and audit history is append-only; the database rejects edits and deletes.

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

**Paying salary (any time: after 15 days, 25 days, month end...)**

1. **Salary Management:** find the worker and press **Settle**.
2. Choose the exact **work period** being paid. The table shows every date as Paid, Partially Paid, or Unpaid.
3. Enter the **cash paid** (and, only if you want to, an **advance recovery** amount). A preview shows how the
   money will be applied, oldest dates first.
4. Press **Record settlement**. You get a receipt number and a permanent record of which dates were paid.
5. Paid too much, wrong worker, or wrong amount? Open the receipt and press **Reverse this settlement** (reason required),
   then record the correct one.

**Reports**

- Open **Reports**, choose a report, set the filters, and press **Show report**. Use **Print**, **Excel**, or **PDF** to take it away.
- Earnings are counted by **work date** and cash by **payment date**: a November payment for October work appears as
  November cash and October earnings. Check the Monthly Wage Report to see this.

**Advances**

- **Advances:** record cash given before wages are earned. It does not count as wages. Recover it later by entering
  an *Advance recovered* amount in a settlement.

**Fixing mistakes**

- Wrong quantity: press **Correct** on the entry, enter the new quantity and a reason.
- Wrong worker or task: press **Void** with a reason and re-enter it.
- Wrong allowance: enter the right amount (or 0 to cancel) and save.
- Nothing is silently overwritten: every change is recorded in the audit log with who, when, and before/after values.
- If the money was already paid for that day, the system asks you to reverse that salary payment first, then correct the entry.

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
| `npm run db:backup` | Create a verified backup in `backups/` (keeps the newest 30) |
| `npm run db:restore -- <file>` | Test-restore a backup into a separate database (add `--live --confirm=OVERWRITE` for disaster recovery) |
| `npm run db:reconcile` | Run the financial integrity checks (exit code 1 if anything is inconsistent) |

## Project structure

```
prisma/
  schema.prisma                 Database schema (money is NUMERIC(14,2))
  sql/financial_constraints.sql CHECKs, partial unique indexes, immutability triggers
  seed.ts                       Roles, permissions, manager account
scripts/                        init-db, backup, restore, reconcile
docs/02-security.md             Security controls, limitations, go-live checklist
docs/03-operations.md           Backups, restore drill, monitoring, incident runbook
docs/01-architecture.md         Architecture, ER diagram, financial design
src/
  app/
    (auth)/login/               Sign-in page
    change-password/            Password change (also forced on first login)
    (app)/                      Authenticated area
      dashboard/ workers/ tasks/ attendance/ work-entry/ allowances/
      salary/ (settle, payments/[id])  advances/  reports/[type]  audit/
    api/reports/[type]/export   Excel and PDF downloads (permission-checked)
    api/health                  Uptime/readiness check
    error.tsx, not-found.tsx    Safe error pages
    actions/                    Server Actions (thin: validate, authorize, call a service)
  server/
    auth/                       Auth.js config, argon2id, lockout, current user
    authz/                      Permission codes, requirePermission()
    services/                   Business logic: workers, tasks, rates, attendance,
                                work entries, allowances, earnings ledger, settlements, reports,
                                allocation engine, advances, balances, audit, pricing
    reports/                    Excel (exceljs) and PDF (pdfkit) renderers
    money/decimal.ts            Exact money math and PKR formatting
  components/                   UI primitives, layout shell, shared widgets
  lib/                          Dates (Asia/Karachi), validators (Zod), navigation, report model
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
- Security headers, including a **per-request nonce Content-Security-Policy** (no inline scripts), X-Frame-Options, and HSTS in production.
- Append-only **audit log** for logins, worker and task changes, rate changes, attendance corrections, entries, allowances, voids.
- Database-level protection: CHECK constraints and triggers make financial history append-only even against raw SQL.
- Automated guards fail the build if any server action or page lacks a permission check, or if browser code imports server code.
- Known trade-offs: lockout can be abused to lock the manager out for a short time; the IP limiter trusts `X-Forwarded-For` and needs a
  reverse proxy that sets it; there is no two-factor login yet. See [`docs/02-security.md`](docs/02-security.md).

**Before going live:** follow the checklist in [`docs/02-security.md`](docs/02-security.md): change `AUTH_SECRET` and the manager password, serve only over HTTPS, schedule backups and copy them off the machine, and complete one test restore.

## Testing

```bash
npm test             # 85 unit tests: money, pricing, rate history, dates, passwords, permissions, allocation engine, reports, Excel/PDF,
                     # CSP, runtime permission checks, and source-code security guards
npm run typecheck
```

**Database integration tests** live in `tests/integration/`: `settlement.int.test.ts` (settlement example, over-payment, simultaneous
settlements, idempotency, advance recovery and reversal, blocked corrections, CHECK constraint) and `reports.int.test.ts`
(October earned / November paid separation, as-of outstanding, worker statement), and `security.int.test.ts` (the database rejects
edits to financial history, over-settling and negative amounts; the integrity check detects drift).
They are skipped unless you point them at a **disposable** test database that has the schema applied
(audit and payment history is append-only, so test data cannot be cleaned up):

```bash
# create a separate database, apply the schema to it, then:
TEST_DATABASE_URL="postgresql://fbm:fbm_dev_password@localhost:5432/fbm_test?schema=public" npm test
```

Manual smoke test after setup:

1. Sign in, change the password, sign in again.
2. Add a task (*Stitching, per unit, Rs. 50*) and a worker.
3. Mark attendance; enter 20 units of Stitching and **Save & approve**. The entry should show Rs. 1,000.
4. Change the Stitching rate to Rs. 60 effective today; the earlier entry must still show Rs. 50 per unit.
5. Add an allowance of Rs. 230. The dashboard should show task earnings and allowances separately.
6. Correct the quantity to 25; the old entry shows as Voided with its reason and a new approved entry appears.
7. Enter work on three dates (Rs. 1,000 / 800 / 1,200), then in **Salary Management** settle that period with Rs. 1,500:
   the dates must show Paid, Partially Paid (Rs. 300 left), and Unpaid.
8. Try to pay more than the outstanding: it must be refused. Reverse the settlement: all three dates return to unpaid.
9. Issue an advance of Rs. 400, then settle with Rs. 300 recovery: the advance balance drops to Rs. 100 and wages drop by Rs. 300.
10. Open **Reports > Monthly Wage Report** for the month of your work: earned and cash are separate columns.
    Export it to Excel and PDF and check the totals match the screen. Print preview should hide the menu.
11. Open **Reports > Outstanding Salary Report** and change the *As of date* to before your payment: the old balance returns.

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

**The app shows "Something went wrong".** Note the Reference code on the page and look for the matching `"level":"error"` line in the server log.

**Upgrading from the Phase 2 build.** The database schema did not change. Run `npm run db:seed` once to retire the old ADMIN and
VIEWER roles; any old `admin` account is moved to the manager role, so delete it if you do not need it.

## Roadmap

- [x] Phase 1: Architecture and database design
- [x] Phase 2: Setup, authentication, app shell, audit log
- [x] Phase 3: Workers, tasks and rates, attendance, work entry, allowances
- [x] Phase 4: Salary settlements (oldest-first, partial payments, reversals), advances and recovery
- [x] Phase 5: Dashboard analytics, reports (monthly wage, worker statement, attendance, production, outstanding, advances), print/Excel/PDF
- [x] Phase 6: Hardening: permission guards, nonce-based CSP, audit log page, integrity checks, backups and restore, dependency audit
- [ ] Phase 7: Production deployment (Docker, HTTPS, scheduled backups) and PWA install

## Documentation

- [`docs/01-architecture.md`](docs/01-architecture.md): architecture proposal, ER diagram, salary calculation logic,
  service breakdown, authentication design, database integrity rules, roadmap.
- [`docs/02-security.md`](docs/02-security.md): threats and controls, known limitations, go-live checklist.
- [`docs/03-operations.md`](docs/03-operations.md): backups, restore drill, integrity checks, monitoring, incident runbook.

## License

Private project for FBM. All rights reserved.
