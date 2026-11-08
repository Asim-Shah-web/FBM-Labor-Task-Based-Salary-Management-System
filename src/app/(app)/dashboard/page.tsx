import { requirePagePermission } from "@/server/authz/require";
import { prisma } from "@/server/db/prisma";
import { toDbDate, todayKarachi, formatDate } from "@/lib/dates";
import { formatPKR, sum } from "@/server/money/decimal";
import { companyTotals, dailyProduction, monthlyTrend } from "@/server/services/balance.service";
import { DashboardCharts } from "@/components/shared/dashboard-charts";
import { listPayments } from "@/server/services/settlement.service";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePagePermission("report:read");
  const { denied } = await searchParams;
  const today = todayKarachi();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [trend, daily, recentWork, totals, recent, activeWorkers, present, absent, onLeave, taskEarn, allowEarn] = await Promise.all([
    monthlyTrend(today, 6),
    dailyProduction(today, 14),
    prisma.dailyWorkEntry.findMany({
      where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 8,
      include: { worker: { select: { fullName: true } }, task: { select: { name: true, unitLabel: true } } },
    }),
    companyTotals(monthStart, today),
    listPayments({ take: 5 }),
    prisma.worker.count({ where: { status: "ACTIVE" } }),
    prisma.attendance.count({ where: { date: toDbDate(today), status: "PRESENT" } }),
    prisma.attendance.count({ where: { date: toDbDate(today), status: "ABSENT" } }),
    prisma.attendance.count({ where: { date: toDbDate(today), status: "LEAVE" } }),
    prisma.earning.aggregate({ where: { status: "ACTIVE", sourceType: "TASK_ENTRY", workDate: { gte: toDbDate(monthStart), lte: toDbDate(today) } }, _sum: { amount: true } }),
    prisma.earning.aggregate({ where: { status: "ACTIVE", sourceType: "DAILY_ALLOWANCE", workDate: { gte: toDbDate(monthStart), lte: toDbDate(today) } }, _sum: { amount: true } }),
  ]);
  const taskTotal = taskEarn._sum.amount?.toString() ?? "0";
  const allowTotal = allowEarn._sum.amount?.toString() ?? "0";
  const earnedTotal = sum([taskTotal, allowTotal]).toString();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">Today is {formatDate(today)}.</p>
      </div>

      {denied === "1" && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">You do not have permission to open that page.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardTitle>Active workers</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{activeWorkers}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Present today</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold text-emerald-700">{present}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Absent today</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold text-red-700">{absent}</div><p className="text-xs text-muted-foreground">{onLeave} on leave</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Not marked today</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{Math.max(activeWorkers - present - absent - onLeave, 0)}</div></CardContent></Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Wages earned this month (by work date)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardHeader><CardTitle>Task earnings</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(taskTotal)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Daily allowances</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(allowTotal)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Total wages earned</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(earnedTotal)}</div></CardContent></Card>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Cash, balances and advances (kept separate on purpose)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardHeader><CardTitle>Cash paid this month</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(totals.cashPaidThisMonth)}</div><p className="text-xs text-muted-foreground">By payment date, any work period</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Outstanding earned wages</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(totals.outstanding)}</div><p className="text-xs text-muted-foreground">As of today, all workers</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Unrecovered advances</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(totals.advanceUnrecovered)}</div><p className="text-xs text-muted-foreground">Not counted as wages</p></CardContent></Card>
        </div>
      </div>

      <DashboardCharts trend={trend} daily={daily} />

      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Recent production activity</CardTitle></CardHeader>
        <CardContent>
          {recentWork.length === 0 ? <p className="text-sm text-muted-foreground">No approved work yet.</p> : (
            <ul className="divide-y text-sm">
              {recentWork.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{e.worker.fullName} <span className="text-xs text-muted-foreground">{e.task.name}: {e.quantity.toString()}{e.task.unitLabel ? ` ${e.task.unitLabel}` : ""} on {formatDate(e.workDate.toISOString().slice(0, 10))}</span></span>
                  <span className="font-medium tabular-nums">{formatPKR(e.amount.toString())}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent salary settlements</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">No settlements yet.</p> : (
            <ul className="divide-y text-sm">
              {recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/salary/payments/${p.id}`} className="min-w-0 truncate text-primary hover:underline">{p.workerName} <span className="text-xs text-muted-foreground">{p.receiptNo}</span></Link>
                  <span className={p.status === "REVERSED" ? "line-through text-muted-foreground" : "font-medium tabular-nums"}>{formatPKR(p.cash)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
