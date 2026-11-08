// Builds every report into the common Report structure (see src/lib/reports/types.ts).
// Principles:
//  - Wages EARNED are bucketed by work date; CASH PAID is bucketed by payment date (never mixed).
//  - Only APPROVED entries / ACTIVE earnings are counted. Voided and draft entries never appear in totals.
//  - All arithmetic is exact decimal; values leave this file as strings.
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { daysBetween, isValidMonth, monthBounds, resolveAsOf, resolvePeriod } from "@/lib/reports/period";
import { formatDate, fromDbDate, todayKarachi, toDbDate } from "@/lib/dates";
import { money, sum, type Money } from "@/server/money/decimal";
import type { Report, ReportParams, ReportType, Row } from "@/lib/reports/types";
import { advanceTotals } from "./advance.service";
import { getPeriodStatement } from "./balance.service";

const m2 = (v: Money) => v.toFixed(2);
const dec = (v: unknown) => money(String(v ?? 0));
const wlabel = (w: { code: string; fullName: string }) => `${w.code} · ${w.fullName}`;

function workerWhere(p: ReportParams): Prisma.WorkerWhereInput {
  return { ...(p.workerId ? { id: p.workerId } : {}), ...(p.department ? { department: { name: p.department } } : {}) };
}

async function describeFilters(p: ReportParams, extra: string[] = []): Promise<string[]> {
  const out = [...extra];
  if (p.workerId) {
    const w = await prisma.worker.findUnique({ where: { id: p.workerId }, select: { code: true, fullName: true } });
    out.push(`Worker: ${w ? wlabel(w) : "unknown"}`);
  }
  if (p.department) out.push(`Department: ${p.department}`);
  if (p.taskId) {
    const t = await prisma.task.findUnique({ where: { id: p.taskId }, select: { code: true, name: true } });
    out.push(`Task: ${t ? `${t.code} · ${t.name}` : "unknown"}`);
  }
  return out;
}

// ───────────── as-of balances (outstanding wages on a past date) ─────────────
// settled(as of X) = allocations + recoveries of payments dated <= X that were not reversed on/before X.
type AsOfRow = { earningId: string; workerId: string; workDate: Date; amount: unknown; settled: unknown };

async function asOfEarnings(asOf: string): Promise<AsOfRow[]> {
  return prisma.$queryRaw<AsOfRow[]>`
    WITH pay AS (
      SELECT pa."earningId" AS eid, SUM(pa.amount) AS amt
      FROM "payment_allocations" pa JOIN "salary_payments" sp ON sp.id = pa."paymentId"
      WHERE sp."paymentDate" <= CAST(${asOf} AS date)
        AND (sp.status = 'POSTED' OR (sp."reversedAt" IS NOT NULL
             AND ((sp."reversedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi')::date > CAST(${asOf} AS date)))
      GROUP BY pa."earningId"
    ), rec AS (
      SELECT ar."earningId" AS eid, SUM(ar.amount) AS amt
      FROM "advance_recoveries" ar JOIN "salary_payments" sp ON sp.id = ar."paymentId"
      WHERE sp."paymentDate" <= CAST(${asOf} AS date)
        AND (sp.status = 'POSTED' OR (sp."reversedAt" IS NOT NULL
             AND ((sp."reversedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi')::date > CAST(${asOf} AS date)))
      GROUP BY ar."earningId"
    )
    SELECT e.id AS "earningId", e."workerId", e."workDate", e.amount,
           COALESCE(pay.amt, 0) + COALESCE(rec.amt, 0) AS settled
    FROM "earnings" e
    LEFT JOIN pay ON pay.eid = e.id
    LEFT JOIN rec ON rec.eid = e.id
    WHERE e.status = 'ACTIVE' AND e."workDate" <= CAST(${asOf} AS date)`;
}

// ───────────── A. Monthly wage report ─────────────
async function monthlyWage(p: ReportParams, today: string): Promise<Report> {
  const month = p.month && isValidMonth(p.month) ? p.month : today.slice(0, 7);
  const { start, end } = monthBounds(month);
  const asOf = end > today ? today : end;
  const ww = workerWhere(p);
  const range = { gte: toDbDate(start), lte: toDbDate(end) };

  const [workers, earn, pays, bal] = await Promise.all([
    prisma.worker.findMany({ where: ww, include: { department: true }, orderBy: { code: "asc" } }),
    prisma.earning.groupBy({ by: ["workerId", "sourceType"], where: { status: "ACTIVE", workDate: range, worker: ww }, _sum: { amount: true } }),
    prisma.salaryPayment.groupBy({ by: ["workerId"], where: { status: "POSTED", paymentDate: range, worker: ww }, _sum: { cashAmount: true, advanceRecoveryAmount: true } }),
    asOfEarnings(asOf),
  ]);
  const ids = new Set(workers.map((w) => w.id));
  const outstanding = new Map<string, Money>();
  for (const r of bal) if (ids.has(r.workerId)) outstanding.set(r.workerId, (outstanding.get(r.workerId) ?? money(0)).plus(dec(r.amount).minus(dec(r.settled))));

  const rows: Row[] = [];
  const t = { task: money(0), allow: money(0), cash: money(0), rec: money(0), out: money(0) };
  for (const w of workers) {
    const task = dec(earn.find((e) => e.workerId === w.id && e.sourceType === "TASK_ENTRY")?._sum.amount);
    const allow = dec(earn.find((e) => e.workerId === w.id && e.sourceType === "DAILY_ALLOWANCE")?._sum.amount);
    const pay = pays.find((x) => x.workerId === w.id);
    const cash = dec(pay?._sum.cashAmount), rec = dec(pay?._sum.advanceRecoveryAmount);
    const out = outstanding.get(w.id) ?? money(0);
    if (task.plus(allow).plus(cash).plus(rec).plus(out).isZero()) continue;
    rows.push({ worker: wlabel(w), department: w.department?.name ?? "-", task: m2(task), allowance: m2(allow), earned: m2(task.plus(allow)), cash: m2(cash), recovered: m2(rec), outstanding: m2(out) });
    t.task = t.task.plus(task); t.allow = t.allow.plus(allow); t.cash = t.cash.plus(cash); t.rec = t.rec.plus(rec); t.out = t.out.plus(out);
  }
  const earned = t.task.plus(t.allow);
  return {
    type: "monthly-wage", title: "Monthly Wage Report", subtitle: `Month: ${month} (${formatDate(start)} to ${formatDate(end)})`,
    filters: await describeFilters(p), generatedAt: today,
    summary: [
      { label: "Wages earned in month (by work date)", value: m2(earned), type: "money" },
      { label: "Cash paid in month (by payment date)", value: m2(t.cash), type: "money" },
      { label: `Outstanding wages as of ${formatDate(asOf)}`, value: m2(t.out), type: "money" },
    ],
    sections: [{
      columns: [
        { key: "worker", label: "Worker", type: "text" }, { key: "department", label: "Department", type: "text" },
        { key: "task", label: "Task earnings", type: "money" }, { key: "allowance", label: "Daily allowances", type: "money" },
        { key: "earned", label: "Total earned", type: "money" }, { key: "cash", label: "Cash paid in month", type: "money" },
        { key: "recovered", label: "Advance recovered in month", type: "money" }, { key: "outstanding", label: "Outstanding (cumulative)", type: "money" },
      ],
      rows,
      totals: { worker: "Total", task: m2(t.task), allowance: m2(t.allow), earned: m2(earned), cash: m2(t.cash), recovered: m2(t.rec), outstanding: m2(t.out) },
      emptyText: "No earnings or payments in this month.",
    }],
    notes: [
      "Earnings are counted in the month of the WORK DATE. Cash is counted in the month it was ACTUALLY PAID. A payment made in November for October work appears as November cash, not November earnings.",
      "Outstanding is cumulative (all unpaid earnings up to the end of the month, or today if the month is still running).",
    ],
  };
}

// ───────────── B. Worker salary statement ─────────────
async function workerStatement(p: ReportParams, today: string): Promise<Report> {
  if (!p.workerId) throw new DomainError("WORKER_REQUIRED", "Choose a worker to see a salary statement.");
  const worker = await prisma.worker.findUnique({ where: { id: p.workerId }, include: { department: true } });
  if (!worker) throw new DomainError("NOT_FOUND", "Worker not found.");
  const { start, end } = resolvePeriod(p, today);

  const [statement, payments, advances, advTotals] = await Promise.all([
    getPeriodStatement(worker.id, start, end),
    prisma.salaryPayment.findMany({
      where: { workerId: worker.id, status: "POSTED" },
      orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
      include: { allocations: { include: { earning: { select: { workDate: true } } } }, recoveries: { include: { earning: { select: { workDate: true } } } } },
    }),
    prisma.advance.findMany({ where: { workerId: worker.id, status: "ACTIVE", advanceDate: { gte: toDbDate(start), lte: toDbDate(end) } }, orderBy: { advanceDate: "asc" } }),
    advanceTotals(worker.id),
  ]);

  // Allocation lines for earnings inside the period.
  const alloc: Row[] = [];
  let cashApplied = money(0), recApplied = money(0);
  for (const pay of payments) {
    const byDate = new Map<string, { cash: Money; rec: Money }>();
    for (const a of pay.allocations) { const d = fromDbDate(a.earning.workDate); if (d < start || d > end) continue; const x = byDate.get(d) ?? { cash: money(0), rec: money(0) }; x.cash = x.cash.plus(a.amount.toString()); byDate.set(d, x); }
    for (const r of pay.recoveries) { const d = fromDbDate(r.earning.workDate); if (d < start || d > end) continue; const x = byDate.get(d) ?? { cash: money(0), rec: money(0) }; x.rec = x.rec.plus(r.amount.toString()); byDate.set(d, x); }
    for (const [d, x] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      alloc.push({ receipt: pay.receiptNo, paidOn: fromDbDate(pay.paymentDate), workDate: d, cash: m2(x.cash), recovered: m2(x.rec) });
      cashApplied = cashApplied.plus(x.cash); recApplied = recApplied.plus(x.rec);
    }
  }
  const paymentsInPeriod = payments.filter((x) => fromDbDate(x.paymentDate) >= start && fromDbDate(x.paymentDate) <= end);
  const t = statement.totals;
  const dayTotals: Row = { date: "Total", task: t.taskEarnings, allowance: t.allowance, earned: t.earned, settled: t.settled, outstanding: t.outstanding };

  return {
    type: "worker-statement", title: "Worker Salary Statement", subtitle: `${wlabel(worker)} | ${formatDate(start)} to ${formatDate(end)}`,
    filters: [`Department: ${worker.department?.name ?? "-"}`, `Status: ${worker.status === "ACTIVE" ? "Active" : "Inactive"}`], generatedAt: today,
    summary: [
      { label: "Total earned (task earnings + allowances)", value: t.earned, type: "money" },
      { label: "Cash paid against this period", value: m2(cashApplied), type: "money" },
      { label: "Advance recovered against this period", value: m2(recApplied), type: "money" },
      { label: "Remaining outstanding wages", value: t.outstanding, type: "money" },
      { label: "Advances issued in period", value: m2(sum(advances.map((a) => a.amount.toString()))), type: "money" },
      { label: "Total unrecovered advance (now)", value: advTotals.unrecovered, type: "money" },
    ],
    sections: [
      {
        heading: "Daily earnings and payment status",
        columns: [
          { key: "date", label: "Date", type: "date" }, { key: "task", label: "Task earnings", type: "money" }, { key: "allowance", label: "Daily allowance", type: "money" },
          { key: "earned", label: "Total earned", type: "money" }, { key: "settled", label: "Settled", type: "money" }, { key: "outstanding", label: "Outstanding", type: "money" },
          { key: "status", label: "Status", type: "status" },
        ],
        rows: statement.rows.map((r) => ({ date: r.date, task: r.taskEarnings, allowance: r.allowance, earned: r.earned, settled: r.settled, outstanding: r.outstanding, status: r.status })),
        totals: dayTotals, emptyText: "No approved earnings in this period.",
      },
      {
        heading: "Payment allocations (which payment covered which work date)",
        columns: [
          { key: "receipt", label: "Receipt", type: "text" }, { key: "paidOn", label: "Paid on", type: "date" }, { key: "workDate", label: "Work date covered", type: "date" },
          { key: "cash", label: "Cash applied", type: "money" }, { key: "recovered", label: "Advance recovered", type: "money" },
        ],
        rows: alloc, emptyText: "No payments applied to this period yet.",
      },
      {
        heading: "Payments made during the period (by payment date)",
        columns: [
          { key: "receipt", label: "Receipt", type: "text" }, { key: "paidOn", label: "Paid on", type: "date" }, { key: "periodStart", label: "Work period from", type: "date" },
          { key: "periodEnd", label: "Work period to", type: "date" }, { key: "cash", label: "Cash", type: "money" }, { key: "recovered", label: "Advance recovered", type: "money" },
        ],
        rows: paymentsInPeriod.map((x) => ({ receipt: x.receiptNo, paidOn: fromDbDate(x.paymentDate), periodStart: fromDbDate(x.periodStart), periodEnd: fromDbDate(x.periodEnd), cash: x.cashAmount.toString(), recovered: x.advanceRecoveryAmount.toString() })),
        emptyText: "No payments were made in this period.",
      },
      {
        heading: "Advances issued in the period",
        columns: [
          { key: "date", label: "Date", type: "date" }, { key: "amount", label: "Amount", type: "money" }, { key: "recovered", label: "Recovered so far", type: "money" }, { key: "outstanding", label: "Unrecovered", type: "money" },
        ],
        rows: advances.map((a) => ({ date: fromDbDate(a.advanceDate), amount: a.amount.toString(), recovered: a.recoveredAmount.toString(), outstanding: m2(money(a.amount.toString()).minus(a.recoveredAmount.toString())) })),
        emptyText: "No advances issued in this period.",
      },
    ],
    notes: ["Settled amounts reflect the current state of all payments (reversed payments are excluded)."],
  };
}

// ───────────── C. Attendance report ─────────────
async function attendanceReport(p: ReportParams, today: string): Promise<Report> {
  const { start, end } = resolvePeriod(p, today);
  const ww = workerWhere(p);
  const [workers, groups] = await Promise.all([
    prisma.worker.findMany({ where: ww, include: { department: true }, orderBy: { code: "asc" } }),
    prisma.attendance.groupBy({ by: ["workerId", "status"], where: { date: { gte: toDbDate(start), lte: toDbDate(end) }, worker: ww }, _count: { _all: true } }),
  ]);
  const get = (id: string, s: string) => groups.find((g) => g.workerId === id && g.status === s)?._count._all ?? 0;
  const rows: Row[] = [];
  let tp = 0, ta = 0, tl = 0;
  for (const w of workers) {
    const pr = get(w.id, "PRESENT"), ab = get(w.id, "ABSENT"), lv = get(w.id, "LEAVE");
    if (pr + ab + lv === 0 && w.status !== "ACTIVE") continue;
    rows.push({ worker: wlabel(w), department: w.department?.name ?? "-", present: String(pr), absent: String(ab), leave: String(lv), marked: String(pr + ab + lv) });
    tp += pr; ta += ab; tl += lv;
  }
  return {
    type: "attendance", title: "Attendance Report", subtitle: `${formatDate(start)} to ${formatDate(end)} (${daysBetween(start, end)} calendar days)`,
    filters: await describeFilters(p), generatedAt: today,
    summary: [{ label: "Present days", value: String(tp), type: "int" }, { label: "Absent days", value: String(ta), type: "int" }, { label: "Leave days", value: String(tl), type: "int" }],
    sections: [{
      columns: [
        { key: "worker", label: "Worker", type: "text" }, { key: "department", label: "Department", type: "text" }, { key: "present", label: "Present", type: "int" },
        { key: "absent", label: "Absent", type: "int" }, { key: "leave", label: "Leave", type: "int" }, { key: "marked", label: "Days marked", type: "int" },
      ],
      rows, totals: { worker: "Total", present: String(tp), absent: String(ta), leave: String(tl), marked: String(tp + ta + tl) },
      emptyText: "No attendance recorded in this period.",
    }],
    notes: ["Attendance never creates wages or allowances."],
  };
}

// ───────────── D. Production report ─────────────
async function productionReport(p: ReportParams, today: string): Promise<Report> {
  const { start, end } = resolvePeriod(p, today);
  const entries = await prisma.dailyWorkEntry.findMany({
    where: { status: "APPROVED", workDate: { gte: toDbDate(start), lte: toDbDate(end) }, worker: workerWhere(p), ...(p.taskId ? { taskId: p.taskId } : {}) },
    include: { worker: { select: { id: true, code: true, fullName: true } }, task: { select: { id: true, code: true, name: true, unitLabel: true, pricingMethod: true } } },
    orderBy: [{ workDate: "asc" }],
  });

  type Agg = { qty: Money; amount: Money; entries: number; workers: Set<string> };
  const mk = (): Agg => ({ qty: money(0), amount: money(0), entries: 0, workers: new Set() });
  const add = (a: Agg, e: (typeof entries)[number]) => { a.qty = a.qty.plus(e.quantity.toString()); a.amount = a.amount.plus(e.amount.toString()); a.entries++; a.workers.add(e.workerId); };

  const byTask = new Map<string, { label: string; unit: string; agg: Agg }>();
  const byWT = new Map<string, { worker: string; task: string; unit: string; agg: Agg }>();
  const byDay = new Map<string, Agg>();
  const byMonth = new Map<string, Agg>();
  for (const e of entries) {
    const unit = e.task.pricingMethod === "PER_UNIT" ? e.task.unitLabel ?? "unit" : "tasks";
    const tk = byTask.get(e.taskId) ?? { label: `${e.task.code} · ${e.task.name}`, unit, agg: mk() }; add(tk.agg, e); byTask.set(e.taskId, tk);
    const wk = `${e.workerId}|${e.taskId}`;
    const wt = byWT.get(wk) ?? { worker: wlabel(e.worker), task: e.task.name, unit, agg: mk() }; add(wt.agg, e); byWT.set(wk, wt);
    const d = fromDbDate(e.workDate);
    const dd = byDay.get(d) ?? mk(); add(dd, e); byDay.set(d, dd);
    const mm = byMonth.get(d.slice(0, 7)) ?? mk(); add(mm, e); byMonth.set(d.slice(0, 7), mm);
  }
  const total = sum(entries.map((e) => e.amount.toString()));

  return {
    type: "production", title: "Production Report", subtitle: `${formatDate(start)} to ${formatDate(end)}`,
    filters: await describeFilters(p), generatedAt: today,
    summary: [{ label: "Approved entries", value: String(entries.length), type: "int" }, { label: "Total task earnings", value: m2(total), type: "money" }],
    sections: [
      {
        heading: "Task-wise totals",
        columns: [{ key: "task", label: "Task", type: "text" }, { key: "unit", label: "Unit", type: "text" }, { key: "qty", label: "Total quantity", type: "qty" }, { key: "entries", label: "Entries", type: "int" }, { key: "workers", label: "Workers", type: "int" }, { key: "amount", label: "Amount", type: "money" }],
        rows: [...byTask.values()].sort((a, b) => a.label.localeCompare(b.label)).map((t) => ({ task: t.label, unit: t.unit, qty: t.agg.qty.toString(), entries: String(t.agg.entries), workers: String(t.agg.workers.size), amount: m2(t.agg.amount) })),
        totals: { task: "Total", entries: String(entries.length), amount: m2(total) }, emptyText: "No approved production in this period.",
      },
      {
        heading: "Worker-wise production",
        columns: [{ key: "worker", label: "Worker", type: "text" }, { key: "task", label: "Task", type: "text" }, { key: "qty", label: "Quantity", type: "qty" }, { key: "unit", label: "Unit", type: "text" }, { key: "amount", label: "Amount", type: "money" }],
        rows: [...byWT.values()].sort((a, b) => a.worker.localeCompare(b.worker) || a.task.localeCompare(b.task)).map((x) => ({ worker: x.worker, task: x.task, qty: x.agg.qty.toString(), unit: x.unit, amount: m2(x.agg.amount) })),
        totals: { worker: "Total", amount: m2(total) },
      },
      {
        heading: "Daily totals",
        columns: [{ key: "date", label: "Date", type: "date" }, { key: "entries", label: "Entries", type: "int" }, { key: "workers", label: "Workers", type: "int" }, { key: "amount", label: "Amount", type: "money" }],
        rows: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, a]) => ({ date: d, entries: String(a.entries), workers: String(a.workers.size), amount: m2(a.amount) })),
        totals: { date: "Total", entries: String(entries.length), amount: m2(total) },
      },
      {
        heading: "Monthly totals",
        columns: [{ key: "month", label: "Month", type: "text" }, { key: "entries", label: "Entries", type: "int" }, { key: "amount", label: "Amount", type: "money" }],
        rows: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, a]) => ({ month: m, entries: String(a.entries), amount: m2(a.amount) })),
        totals: { month: "Total", entries: String(entries.length), amount: m2(total) },
      },
    ],
    notes: ["Quantities of different tasks use different units, so quantity totals are given per task only."],
  };
}

// ───────────── E. Outstanding salary report ─────────────
async function outstandingReport(p: ReportParams, today: string): Promise<Report> {
  const asOf = resolveAsOf(p, today);
  const [workers, bal] = await Promise.all([
    prisma.worker.findMany({ where: workerWhere(p), select: { id: true, code: true, fullName: true } }),
    asOfEarnings(asOf),
  ]);
  const wmap = new Map(workers.map((w) => [w.id, w]));
  const agg = new Map<string, { workerId: string; date: string; original: Money; settled: Money }>();
  for (const r of bal) {
    if (!wmap.has(r.workerId)) continue;
    const date = fromDbDate(new Date(r.workDate));
    const k = `${r.workerId}|${date}`;
    const x = agg.get(k) ?? { workerId: r.workerId, date, original: money(0), settled: money(0) };
    x.original = x.original.plus(dec(r.amount)); x.settled = x.settled.plus(dec(r.settled)); agg.set(k, x);
  }
  const lines = [...agg.values()].filter((x) => x.original.gt(x.settled))
    .sort((a, b) => wmap.get(a.workerId)!.code.localeCompare(wmap.get(b.workerId)!.code) || a.date.localeCompare(b.date));
  const t = { o: sum(lines.map((l) => l.original)), s: sum(lines.map((l) => l.settled)) };
  return {
    type: "outstanding", title: "Outstanding Salary Report", subtitle: `As of ${formatDate(asOf)}`,
    filters: await describeFilters(p), generatedAt: today,
    summary: [{ label: "Total remaining unpaid", value: m2(t.o.minus(t.s)), type: "money" }, { label: "Workers with unpaid wages", value: String(new Set(lines.map((l) => l.workerId)).size), type: "int" }],
    sections: [{
      columns: [
        { key: "worker", label: "Worker", type: "text" }, { key: "date", label: "Work date", type: "date" }, { key: "original", label: "Original earnings", type: "money" },
        { key: "settled", label: "Amount settled", type: "money" }, { key: "remaining", label: "Remaining unpaid", type: "money" }, { key: "status", label: "Status", type: "status" },
      ],
      rows: lines.map((l) => ({ worker: wlabel(wmap.get(l.workerId)!), date: l.date, original: m2(l.original), settled: m2(l.settled), remaining: m2(l.original.minus(l.settled)), status: l.settled.gt(0) ? "PARTIAL" : "UNPAID" })),
      totals: { worker: "Total", original: m2(t.o), settled: m2(t.s), remaining: m2(t.o.minus(t.s)) },
      emptyText: "Nothing is outstanding. All approved wages are paid.",
    }],
    notes: ["Payments are counted by payment date; a reversal is counted from the date it was made. Earnings reflect the currently approved entries."],
  };
}

// ───────────── F. Advance report ─────────────
async function advanceReport(p: ReportParams, today: string): Promise<Report> {
  const { start, end } = resolvePeriod(p, today);
  const advances = await prisma.advance.findMany({
    where: { status: "ACTIVE", advanceDate: { gte: toDbDate(start), lte: toDbDate(end) }, worker: workerWhere(p) },
    include: { worker: { select: { code: true, fullName: true } } },
    orderBy: [{ advanceDate: "asc" }, { createdAt: "asc" }],
  });
  const recoveries = advances.length
    ? await prisma.advanceRecovery.findMany({
        where: { advanceId: { in: advances.map((a) => a.id) }, payment: { status: "POSTED" } },
        include: { payment: { select: { receiptNo: true, paymentDate: true } }, advance: { select: { worker: { select: { code: true, fullName: true } } } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const issued = sum(advances.map((a) => a.amount.toString())), recovered = sum(advances.map((a) => a.recoveredAmount.toString()));
  return {
    type: "advances", title: "Advance Report", subtitle: `Advances issued ${formatDate(start)} to ${formatDate(end)}`,
    filters: await describeFilters(p), generatedAt: today,
    summary: [{ label: "Advances issued", value: m2(issued), type: "money" }, { label: "Recovered so far", value: m2(recovered), type: "money" }, { label: "Outstanding advances", value: m2(issued.minus(recovered)), type: "money" }],
    sections: [
      {
        heading: "Advances",
        columns: [
          { key: "date", label: "Date", type: "date" }, { key: "worker", label: "Worker", type: "text" }, { key: "amount", label: "Amount issued", type: "money" },
          { key: "recovered", label: "Amount recovered", type: "money" }, { key: "outstanding", label: "Outstanding", type: "money" }, { key: "notes", label: "Notes", type: "text" },
        ],
        rows: advances.map((a) => ({ date: fromDbDate(a.advanceDate), worker: wlabel(a.worker), amount: a.amount.toString(), recovered: a.recoveredAmount.toString(), outstanding: m2(money(a.amount.toString()).minus(a.recoveredAmount.toString())), notes: a.notes ?? "" })),
        totals: { date: "Total", amount: m2(issued), recovered: m2(recovered), outstanding: m2(issued.minus(recovered)) }, emptyText: "No advances in this period.",
      },
      {
        heading: "Recoveries made against these advances",
        columns: [{ key: "paidOn", label: "Paid on", type: "date" }, { key: "receipt", label: "Receipt", type: "text" }, { key: "worker", label: "Worker", type: "text" }, { key: "amount", label: "Amount recovered", type: "money" }],
        rows: recoveries.map((r) => ({ paidOn: fromDbDate(r.payment.paymentDate), receipt: r.payment.receiptNo, worker: wlabel(r.advance.worker), amount: r.amount.toString() })),
        emptyText: "No recoveries yet.",
      },
    ],
    notes: ["Advances are not wages. They are recovered only when the manager enters a recovery amount during a salary settlement. Voided advances are excluded."],
  };
}

export async function buildReport(type: ReportType, params: ReportParams, today: string = todayKarachi()): Promise<Report> {
  switch (type) {
    case "monthly-wage": return monthlyWage(params, today);
    case "worker-statement": return workerStatement(params, today);
    case "attendance": return attendanceReport(params, today);
    case "production": return productionReport(params, today);
    case "outstanding": return outstandingReport(params, today);
    case "advances": return advanceReport(params, today);
  }
}
