// Integrity checks: recompute what the ledger SHOULD say from the immutable history rows and
// compare with the stored running totals. Any difference means a bug or manual database tampering.
// Read-only: it never changes data.
import { prisma } from "@/server/db/prisma";

export type CheckResult = { id: string; name: string; ok: boolean; count: number; sample: string[] };

type IdRow = { id: string; detail?: string };

async function check(id: string, name: string, rows: Promise<IdRow[]>): Promise<CheckResult> {
  const r = await rows;
  return { id, name, ok: r.length === 0, count: r.length, sample: r.slice(0, 5).map((x) => (x.detail ? `${x.id} (${x.detail})` : x.id)) };
}

export async function runIntegrityChecks(): Promise<CheckResult[]> {
  return Promise.all([
    check(
      "earning-settled",
      "Every earning's settled amount equals its posted allocations + recoveries",
      prisma.$queryRaw<IdRow[]>`
        SELECT x.id, 'recorded ' || x.recorded || ', history ' || x.computed AS detail FROM (
          SELECT e.id, e."settledAmount" AS recorded,
            COALESCE((SELECT SUM(pa.amount) FROM "payment_allocations" pa JOIN "salary_payments" sp ON sp.id = pa."paymentId"
                      WHERE pa."earningId" = e.id AND sp.status = 'POSTED'), 0)
          + COALESCE((SELECT SUM(ar.amount) FROM "advance_recoveries" ar JOIN "salary_payments" sp ON sp.id = ar."paymentId"
                      WHERE ar."earningId" = e.id AND sp.status = 'POSTED'), 0) AS computed
          FROM "earnings" e) x
        WHERE x.recorded <> x.computed`,
    ),
    check(
      "advance-recovered",
      "Every advance's recovered amount equals its posted recoveries",
      prisma.$queryRaw<IdRow[]>`
        SELECT x.id, 'recorded ' || x.recorded || ', history ' || x.computed AS detail FROM (
          SELECT a.id, a."recoveredAmount" AS recorded,
            COALESCE((SELECT SUM(ar.amount) FROM "advance_recoveries" ar JOIN "salary_payments" sp ON sp.id = ar."paymentId"
                      WHERE ar."advanceId" = a.id AND sp.status = 'POSTED'), 0) AS computed
          FROM "advances" a) x
        WHERE x.recorded <> x.computed`,
    ),
    check(
      "payment-totals",
      "Every payment's cash and recovery equal the sum of its allocation and recovery rows",
      prisma.$queryRaw<IdRow[]>`
        SELECT sp.id, sp."receiptNo" AS detail FROM "salary_payments" sp
        WHERE sp."cashAmount" <> COALESCE((SELECT SUM(pa.amount) FROM "payment_allocations" pa WHERE pa."paymentId" = sp.id), 0)
           OR sp."advanceRecoveryAmount" <> COALESCE((SELECT SUM(ar.amount) FROM "advance_recoveries" ar WHERE ar."paymentId" = sp.id), 0)`,
    ),
    check(
      "approved-without-earning",
      "Every approved work entry or allowance with an amount has an earning",
      prisma.$queryRaw<IdRow[]>`
        SELECT d.id, 'work entry' AS detail FROM "daily_work_entries" d LEFT JOIN "earnings" e ON e."workEntryId" = d.id
          WHERE d.status = 'APPROVED' AND d.amount > 0 AND e.id IS NULL
        UNION ALL
        SELECT a.id, 'allowance' AS detail FROM "daily_allowances" a LEFT JOIN "earnings" e ON e."allowanceId" = a.id
          WHERE a.status = 'APPROVED' AND a.amount > 0 AND e.id IS NULL`,
    ),
    check(
      "active-earning-bad-source",
      "No active earning comes from a voided or draft entry",
      prisma.$queryRaw<IdRow[]>`
        SELECT e.id, 'work entry ' || d.status AS detail FROM "earnings" e JOIN "daily_work_entries" d ON d.id = e."workEntryId"
          WHERE e.status = 'ACTIVE' AND d.status <> 'APPROVED'
        UNION ALL
        SELECT e.id, 'allowance ' || a.status AS detail FROM "earnings" e JOIN "daily_allowances" a ON a.id = e."allowanceId"
          WHERE e.status = 'ACTIVE' AND a.status <> 'APPROVED'`,
    ),
    check(
      "earning-amount-matches-source",
      "Every earning's amount equals its source entry or allowance",
      prisma.$queryRaw<IdRow[]>`
        SELECT e.id, 'earning ' || e.amount || ' vs source ' || d.amount AS detail FROM "earnings" e JOIN "daily_work_entries" d ON d.id = e."workEntryId" WHERE e.amount <> d.amount
        UNION ALL
        SELECT e.id, 'earning ' || e.amount || ' vs source ' || a.amount AS detail FROM "earnings" e JOIN "daily_allowances" a ON a.id = e."allowanceId" WHERE e.amount <> a.amount`,
    ),
    check(
      "entry-amount-math",
      "Every work entry amount equals quantity x applied rate (rounded to paisa)",
      prisma.$queryRaw<IdRow[]>`
        SELECT d.id, d.quantity || ' x ' || d."appliedRate" || ' <> ' || d.amount AS detail FROM "daily_work_entries" d
        WHERE d.amount <> ROUND(d.quantity * d."appliedRate", 2)`,
    ),
  ]);
}
