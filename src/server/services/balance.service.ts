// Read-side balances. Everything is derived from the earnings ledger (the source of truth).
import { prisma } from "@/server/db/prisma";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { money, sum } from "@/server/money/decimal";

export type DayStatus = "PAID" | "PARTIAL" | "UNPAID";
export type DayRow = {
  date: string; taskEarnings: string; allowance: string; earned: string; settled: string; outstanding: string; status: DayStatus;
};

export function dayStatus(earned: string, settled: string): DayStatus {
  const e = money(earned), s = money(settled);
  if (s.gte(e)) return "PAID";
  return s.gt(0) ? "PARTIAL" : "UNPAID";
}

/** Per-date earned / settled / outstanding for one worker over [start, end]. */
export async function getPeriodStatement(workerId: string, start: string, end: string) {
  const earnings = await prisma.earning.findMany({
    where: { workerId, status: "ACTIVE", workDate: { gte: toDbDate(start), lte: toDbDate(end) } },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });
  const byDate = new Map<string, { task: string[]; allow: string[]; settled: string[] }>();
  for (const e of earnings) {
    const k = fromDbDate(e.workDate);
    const g = byDate.get(k) ?? { task: [], allow: [], settled: [] };
    (e.sourceType === "TASK_ENTRY" ? g.task : g.allow).push(e.amount.toString());
    g.settled.push(e.settledAmount.toString());
    byDate.set(k, g);
  }
  const rows: DayRow[] = [...byDate.entries()].map(([date, g]) => {
    const task = sum(g.task), allow = sum(g.allow), settled = sum(g.settled), earned = task.plus(allow);
    return {
      date, taskEarnings: task.toString(), allowance: allow.toString(), earned: earned.toString(), settled: settled.toString(),
      outstanding: earned.minus(settled).toString(), status: dayStatus(earned.toString(), settled.toString()),
    };
  });
  const earned = sum(rows.map((r) => r.earned)), settled = sum(rows.map((r) => r.settled));
  return {
    rows,
    totals: {
      taskEarnings: sum(rows.map((r) => r.taskEarnings)).toString(), allowance: sum(rows.map((r) => r.allowance)).toString(),
      earned: earned.toString(), settled: settled.toString(), outstanding: earned.minus(settled).toString(),
    },
  };
}

export async function earliestOutstandingDate(workerId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ d: Date }[]>`
    SELECT MIN("workDate") AS d FROM "earnings"
    WHERE "workerId" = ${workerId} AND status = 'ACTIVE' AND amount > "settledAmount"`;
  return rows[0]?.d ? fromDbDate(new Date(rows[0].d)) : null;
}

export type WorkerBalanceRow = {
  workerId: string; code: string; name: string; status: "ACTIVE" | "INACTIVE";
  earned: string; settled: string; outstanding: string; advanceUnrecovered: string;
};

/** Balance per worker (only workers with something owed or an open advance). */
export async function listWorkerBalances(): Promise<WorkerBalanceRow[]> {
  const [earn, adv] = await Promise.all([
    prisma.earning.groupBy({ by: ["workerId"], where: { status: "ACTIVE" }, _sum: { amount: true, settledAmount: true } }),
    prisma.advance.groupBy({ by: ["workerId"], where: { status: "ACTIVE" }, _sum: { amount: true, recoveredAmount: true } }),
  ]);
  const ids = [...new Set([...earn.map((e) => e.workerId), ...adv.map((a) => a.workerId)])];
  const workers = await prisma.worker.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, fullName: true, status: true } });
  const out: WorkerBalanceRow[] = [];
  for (const w of workers) {
    const e = earn.find((x) => x.workerId === w.id), a = adv.find((x) => x.workerId === w.id);
    const earned = money(e?._sum.amount?.toString() ?? "0"), settled = money(e?._sum.settledAmount?.toString() ?? "0");
    const unrecovered = money(a?._sum.amount?.toString() ?? "0").minus(a?._sum.recoveredAmount?.toString() ?? "0");
    const outstanding = earned.minus(settled);
    if (outstanding.lte(0) && unrecovered.lte(0)) continue;
    out.push({
      workerId: w.id, code: w.code, name: w.fullName, status: w.status, earned: earned.toString(), settled: settled.toString(),
      outstanding: outstanding.toString(), advanceUnrecovered: unrecovered.toString(),
    });
  }
  return out.sort((x, y) => money(y.outstanding).comparedTo(x.outstanding) || x.code.localeCompare(y.code));
}

export async function companyTotals(monthStart: string, today: string) {
  const [earn, adv, cash] = await Promise.all([
    prisma.earning.aggregate({ where: { status: "ACTIVE" }, _sum: { amount: true, settledAmount: true } }),
    prisma.advance.aggregate({ where: { status: "ACTIVE" }, _sum: { amount: true, recoveredAmount: true } }),
    prisma.salaryPayment.aggregate({
      where: { status: "POSTED", paymentDate: { gte: toDbDate(monthStart), lte: toDbDate(today) } },
      _sum: { cashAmount: true, advanceRecoveryAmount: true },
    }),
  ]);
  return {
    outstanding: money(earn._sum.amount?.toString() ?? "0").minus(earn._sum.settledAmount?.toString() ?? "0").toString(),
    advanceUnrecovered: money(adv._sum.amount?.toString() ?? "0").minus(adv._sum.recoveredAmount?.toString() ?? "0").toString(),
    cashPaidThisMonth: cash._sum.cashAmount?.toString() ?? "0",
    recoveredThisMonth: cash._sum.advanceRecoveryAmount?.toString() ?? "0",
  };
}
