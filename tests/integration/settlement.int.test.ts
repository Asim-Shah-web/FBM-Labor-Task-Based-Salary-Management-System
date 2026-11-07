/**
 * DATABASE integration tests for the money-critical paths.
 * They only run when TEST_DATABASE_URL points at a DISPOSABLE PostgreSQL database that already has the
 * schema + financial constraints applied (npm run db:init against that database).
 *
 *   TEST_DATABASE_URL="postgresql://fbm:fbm_dev_password@localhost:5432/fbm_test?schema=public" npm test
 *
 * The audit log and payment history are append-only by design, so test data cannot be cleaned up.
 * Never point this at a database that holds real data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("settlement (database)", () => {
  // Imported lazily so the Prisma client reads TEST_DATABASE_URL.
  let prisma: typeof import("@/server/db/prisma").prisma;
  let svc: {
    work: typeof import("@/server/services/work-entry.service");
    settle: typeof import("@/server/services/settlement.service");
    adv: typeof import("@/server/services/advance.service");
    worker: typeof import("@/server/services/worker.service");
    task: typeof import("@/server/services/task.service");
    allowance: typeof import("@/server/services/allowance.service");
  };
  let actor: { id: string };
  const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

  beforeAll(async () => {
    prisma = (await import("@/server/db/prisma")).prisma;
    svc = {
      work: await import("@/server/services/work-entry.service"),
      settle: await import("@/server/services/settlement.service"),
      adv: await import("@/server/services/advance.service"),
      worker: await import("@/server/services/worker.service"),
      task: await import("@/server/services/task.service"),
      allowance: await import("@/server/services/allowance.service"),
    };
    const u = await prisma.user.create({ data: { username: `it-${tag.toLowerCase()}`, fullName: "Integration", passwordHash: "x" } });
    actor = { id: u.id };
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function setup(days: { date: string; qty: string }[]) {
    const worker = await svc.worker.createWorker(actor, { fullName: `Worker ${tag}-${Math.random().toString(36).slice(2, 5)}`, joiningDate: "2026-01-01" });
    const task = await svc.task.createTask(actor, { code: `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`, name: "Stitching", pricingMethod: "PER_UNIT", unitLabel: "unit", rate: "50", effectiveFrom: "2026-01-01" });
    for (const d of days) await svc.work.createEntries(actor, { workDate: d.date, approve: true, lines: [{ workerId: worker.id, taskId: task.id, quantity: d.qty }] });
    return { worker, task };
  }
  const key = () => `key-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const period = { periodStart: "2026-10-01", periodEnd: "2026-10-03", paymentDate: "2026-10-04" };

  it("spec example: 1,500 against 1,000 / 800 / 1,200 settles oldest first", async () => {
    // 20 x 50 = 1000, 16 x 50 = 800, 24 x 50 = 1200
    const { worker } = await setup([{ date: "2026-10-01", qty: "20" }, { date: "2026-10-02", qty: "16" }, { date: "2026-10-03", qty: "24" }]);
    const r = await svc.settle.postSettlement(actor, { workerId: worker.id, ...period, cashAmount: "1500", advanceRecoveryAmount: "0", idempotencyKey: key() });
    const p = await svc.settle.getPayment(r.id);
    expect(p!.lines.map((l) => [l.date, l.cash])).toEqual([["2026-10-01", "1000"], ["2026-10-02", "500"]]);
    const e = await prisma.earning.findMany({ where: { workerId: worker.id }, orderBy: { workDate: "asc" } });
    expect(e.map((x) => x.settledAmount.toString())).toEqual(["1000", "500", "0"]);
  });

  it("rejects over-payment and changes nothing", async () => {
    const { worker } = await setup([{ date: "2026-10-01", qty: "2" }]);
    await expect(svc.settle.postSettlement(actor, { workerId: worker.id, ...period, cashAmount: "100.01", advanceRecoveryAmount: "0", idempotencyKey: key() })).rejects.toThrow(/more than the outstanding/);
    expect(await prisma.salaryPayment.count({ where: { workerId: worker.id } })).toBe(0);
  });

  it("two simultaneous settlements can never over-settle", async () => {
    const { worker } = await setup([{ date: "2026-10-01", qty: "20" }]); // 1000 outstanding
    const attempt = () => svc.settle.postSettlement(actor, { workerId: worker.id, ...period, cashAmount: "700", advanceRecoveryAmount: "0", idempotencyKey: key() });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const e = await prisma.earning.findFirstOrThrow({ where: { workerId: worker.id } });
    expect(e.settledAmount.toString()).toBe("700");
  });

  it("the same idempotency key never creates two payments", async () => {
    const { worker } = await setup([{ date: "2026-10-01", qty: "20" }]);
    const k = key();
    const input = { workerId: worker.id, ...period, cashAmount: "300", advanceRecoveryAmount: "0", idempotencyKey: k };
    const [a, b] = await Promise.all([svc.settle.postSettlement(actor, input), svc.settle.postSettlement(actor, input)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.salaryPayment.count({ where: { workerId: worker.id } })).toBe(1);
  });

  it("advance recovery reduces both the advance and the wages; reversal restores both", async () => {
    const { worker } = await setup([{ date: "2026-10-01", qty: "20" }]);
    await svc.adv.issueAdvance(actor, { workerId: worker.id, advanceDate: "2026-09-20", amount: "400" });
    const r = await svc.settle.postSettlement(actor, { workerId: worker.id, ...period, cashAmount: "500", advanceRecoveryAmount: "300", idempotencyKey: key() });
    expect((await svc.adv.advanceTotals(worker.id)).unrecovered).toBe("100");
    expect((await prisma.earning.findFirstOrThrow({ where: { workerId: worker.id } })).settledAmount.toString()).toBe("800");

    await svc.settle.reverseSettlement(actor, r.id, "test reversal");
    expect((await svc.adv.advanceTotals(worker.id)).unrecovered).toBe("400");
    expect((await prisma.earning.findFirstOrThrow({ where: { workerId: worker.id } })).settledAmount.toString()).toBe("0");
    await expect(svc.settle.reverseSettlement(actor, r.id, "again")).rejects.toThrow(/already reversed/);
  });

  it("an entry whose earning was paid cannot be voided until the payment is reversed", async () => {
    const { worker } = await setup([{ date: "2026-10-01", qty: "20" }]);
    const r = await svc.settle.postSettlement(actor, { workerId: worker.id, ...period, cashAmount: "100", advanceRecoveryAmount: "0", idempotencyKey: key() });
    const entry = await prisma.dailyWorkEntry.findFirstOrThrow({ where: { workerId: worker.id } });
    await expect(svc.work.voidEntry(actor, entry.id, "wrong entry")).rejects.toThrow(/already been paid/);
    await svc.settle.reverseSettlement(actor, r.id, "undo");
    await svc.work.voidEntry(actor, entry.id, "wrong entry");
  });

  it("the database itself rejects over-settling (CHECK constraint)", async () => {
    const { worker } = await setup([{ date: "2026-10-01", qty: "1" }]); // 50
    const e = await prisma.earning.findFirstOrThrow({ where: { workerId: worker.id } });
    await expect(prisma.earning.update({ where: { id: e.id }, data: { settledAmount: "50.01" } })).rejects.toThrow();
  });
});
