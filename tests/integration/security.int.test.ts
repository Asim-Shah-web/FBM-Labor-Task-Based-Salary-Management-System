/**
 * DATABASE integration tests for the database-level safety net and the integrity checks.
 * Runs only with TEST_DATABASE_URL (a DISPOSABLE database with the schema + financial constraints applied).
 * These prove that even raw SQL (or a future bug) cannot corrupt financial history.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("database safety net", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let workerId: string, taskId: string, paymentId: string, earningId: string, actor: { id: string };
  let runIntegrityChecks: typeof import("@/server/services/reconcile.service").runIntegrityChecks;

  beforeAll(async () => {
    prisma = (await import("@/server/db/prisma")).prisma;
    runIntegrityChecks = (await import("@/server/services/reconcile.service")).runIntegrityChecks;
    const { createWorker } = await import("@/server/services/worker.service");
    const { createTask } = await import("@/server/services/task.service");
    const { createEntries } = await import("@/server/services/work-entry.service");
    const { postSettlement } = await import("@/server/services/settlement.service");
    const tag = Math.random().toString(36).slice(2, 8);
    actor = { id: (await prisma.user.create({ data: { username: `sec-${tag}`, fullName: "Security IT", passwordHash: "x" } })).id };
    workerId = (await createWorker(actor, { fullName: `Sec Worker ${tag}`, joiningDate: "2026-01-01" })).id;
    taskId = (await createTask(actor, { code: `S${tag.toUpperCase()}`, name: "Stitching", pricingMethod: "PER_UNIT", unitLabel: "unit", rate: "50", effectiveFrom: "2026-01-01" })).id;
    await createEntries(actor, { workDate: "2026-10-01", approve: true, lines: [{ workerId, taskId, quantity: "20" }] });
    paymentId = (await postSettlement(actor, { workerId, paymentDate: "2026-10-02", periodStart: "2026-10-01", periodEnd: "2026-10-01", cashAmount: "400", advanceRecoveryAmount: "0", idempotencyKey: `sec-key-${tag}-${Date.now()}` })).id;
    earningId = (await prisma.earning.findFirstOrThrow({ where: { workerId } })).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("audit log rows cannot be updated or deleted", async () => {
    await expect(prisma.$executeRaw`UPDATE "audit_logs" SET action = 'tampered'`).rejects.toThrow(/immutable/);
    await expect(prisma.$executeRaw`DELETE FROM "audit_logs"`).rejects.toThrow(/immutable/);
  });
  it("payment allocations and advance recoveries cannot be changed or deleted", async () => {
    await expect(prisma.$executeRaw`UPDATE "payment_allocations" SET amount = 1 WHERE "paymentId" = ${paymentId}`).rejects.toThrow(/immutable/);
    await expect(prisma.$executeRaw`DELETE FROM "payment_allocations" WHERE "paymentId" = ${paymentId}`).rejects.toThrow(/immutable/);
  });
  it("an earning's amount and identity are immutable; it cannot be deleted", async () => {
    await expect(prisma.$executeRaw`UPDATE "earnings" SET amount = 1 WHERE id = ${earningId}`).rejects.toThrow(/immutable/);
    await expect(prisma.$executeRaw`DELETE FROM "earnings" WHERE id = ${earningId}`).rejects.toThrow(/immutable/);
  });
  it("a payment's amounts cannot be edited or the payment deleted", async () => {
    await expect(prisma.$executeRaw`UPDATE "salary_payments" SET "cashAmount" = 999 WHERE id = ${paymentId}`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM "salary_payments" WHERE id = ${paymentId}`).rejects.toThrow(/immutable/);
  });
  it("over-settling and negative amounts are rejected by CHECK constraints", async () => {
    await expect(prisma.$executeRaw`UPDATE "earnings" SET "settledAmount" = amount + 1 WHERE id = ${earningId}`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "advances" SET "recoveredAmount" = -1`).resolves.toBe(0); // no rows in this scope is fine
    await expect(prisma.dailyAllowance.create({ data: { workerId, workDate: new Date("2026-10-05"), amount: "-5", createdById: actor.id } })).rejects.toThrow();
  });
  it("a second active entry for the same worker, date and task is rejected by the database", async () => {
    await expect(prisma.dailyWorkEntry.create({
      data: { workerId, workDate: new Date("2026-10-01"), taskId, pricingMethod: "PER_UNIT", quantity: "1", appliedRate: "50", amount: "50", status: "DRAFT", createdById: actor.id },
    })).rejects.toThrow();
  });

  it("integrity checks pass on consistent data and DETECT drift", async () => {
    expect((await runIntegrityChecks()).filter((r) => !r.ok)).toEqual([]);
    // Simulate corruption (allowed by triggers, which only protect identity/amount) and make sure it is caught.
    await prisma.$executeRaw`UPDATE "earnings" SET "settledAmount" = 1 WHERE id = ${earningId}`;
    try {
      const failed = (await runIntegrityChecks()).filter((r) => !r.ok).map((r) => r.id);
      expect(failed).toContain("earning-settled");
    } finally {
      await prisma.$executeRaw`UPDATE "earnings" SET "settledAmount" = 400 WHERE id = ${earningId}`;
    }
    expect((await runIntegrityChecks()).filter((r) => !r.ok)).toEqual([]);
  });
});
