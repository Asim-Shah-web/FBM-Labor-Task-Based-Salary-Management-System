/**
 * DATABASE integration test for the reports. Runs only with TEST_DATABASE_URL (see settlement.int.test.ts).
 * Verifies the key reporting rule: earnings are bucketed by WORK date, cash by PAYMENT date.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("reports (database)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let workerId: string;
  let build: typeof import("@/server/services/report.service").buildReport;
  const val = (r: Awaited<ReturnType<typeof build>>, label: string) => r.summary!.find((s) => s.label.startsWith(label))!.value;

  beforeAll(async () => {
    prisma = (await import("@/server/db/prisma")).prisma;
    build = (await import("@/server/services/report.service")).buildReport;
    const { createWorker } = await import("@/server/services/worker.service");
    const { createTask } = await import("@/server/services/task.service");
    const { createEntries } = await import("@/server/services/work-entry.service");
    const { saveAllowances } = await import("@/server/services/allowance.service");
    const { postSettlement } = await import("@/server/services/settlement.service");
    const tag = Math.random().toString(36).slice(2, 8);
    const u = await prisma.user.create({ data: { username: `rep-${tag}`, fullName: "Reports IT", passwordHash: "x" } });
    const actor = { id: u.id };
    const w = await createWorker(actor, { fullName: `Report Worker ${tag}`, joiningDate: "2026-01-01" });
    workerId = w.id;
    const t = await createTask(actor, { code: `R${tag.toUpperCase()}`, name: "Stitching", pricingMethod: "PER_UNIT", unitLabel: "unit", rate: "50", effectiveFrom: "2026-01-01" });
    await createEntries(actor, { workDate: "2026-10-01", approve: true, lines: [{ workerId, taskId: t.id, quantity: "20" }] }); // 1000
    await saveAllowances(actor, { workDate: "2026-10-01", rows: [{ workerId, amount: "230", reason: "Machine breakdown" }] }); // 230
    // October work, paid in November
    await postSettlement(actor, { workerId, paymentDate: "2026-11-03", periodStart: "2026-10-01", periodEnd: "2026-10-31", cashAmount: "600", advanceRecoveryAmount: "0", idempotencyKey: `rep-key-${tag}-${Date.now()}` });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("October report: earned 1,230, no cash paid in October, all of it outstanding at month end", async () => {
    const r = await build("monthly-wage", { month: "2026-10", workerId }, "2026-11-30");
    expect(val(r, "Wages earned")).toBe("1230.00");
    expect(val(r, "Cash paid")).toBe("0.00");
    expect(val(r, "Outstanding")).toBe("1230.00");
    expect(r.sections[0]!.rows[0]).toMatchObject({ task: "1000.00", allowance: "230.00", earned: "1230.00" });
  });

  it("November report: no earnings, Rs. 600 cash (for October work), 630 outstanding", async () => {
    const r = await build("monthly-wage", { month: "2026-11", workerId }, "2026-11-30");
    expect(val(r, "Wages earned")).toBe("0.00");
    expect(val(r, "Cash paid")).toBe("600.00");
    expect(val(r, "Outstanding")).toBe("630.00");
  });

  it("outstanding report is as-of aware", async () => {
    const before = await build("outstanding", { asOf: "2026-11-02", workerId }, "2026-11-30");
    expect(val(before, "Total remaining")).toBe("1230.00");
    const after = await build("outstanding", { asOf: "2026-11-30", workerId }, "2026-11-30");
    expect(val(after, "Total remaining")).toBe("630.00");
    expect(after.sections[0]!.rows[0]).toMatchObject({ original: "1230.00", settled: "600.00", remaining: "630.00", status: "PARTIAL" });
  });

  it("worker statement shows the date as partially paid with the allocation", async () => {
    const r = await build("worker-statement", { workerId, start: "2026-10-01", end: "2026-10-31" }, "2026-11-30");
    expect(r.sections[0]!.rows[0]).toMatchObject({ earned: "1230.00", settled: "600.00", outstanding: "630.00", status: "PARTIAL" });
    expect(r.sections[1]!.rows[0]).toMatchObject({ workDate: "2026-10-01", cash: "600.00" });
  });

  it("production report counts only approved entries", async () => {
    const r = await build("production", { start: "2026-10-01", end: "2026-10-31", workerId }, "2026-11-30");
    expect(val(r, "Total task earnings")).toBe("1000.00");
  });
});
