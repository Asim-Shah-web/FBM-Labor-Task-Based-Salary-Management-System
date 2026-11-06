import { requirePagePermission } from "@/server/authz/require";
import { prisma } from "@/server/db/prisma";
import { toDbDate, todayKarachi, formatDate } from "@/lib/dates";
import { formatPKR, sum } from "@/server/money/decimal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// Money cards are deliberately separate (never combined into one figure).
// Cash paid / outstanding / advances become live in Phase 4; reports in Phase 5.
const LATER_CARDS = [
  { title: "Cash paid (this month)", note: "By payment date" },
  { title: "Outstanding wages", note: "As of selected date" },
  { title: "Unrecovered advances", note: "Issued minus recovered" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePagePermission("report:read");
  const { denied } = await searchParams;
  const today = todayKarachi();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [activeWorkers, present, absent, onLeave, taskEarn, allowEarn] = await Promise.all([
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

      <div className="grid gap-3 sm:grid-cols-3">
        {LATER_CARDS.map((c) => (
          <Card key={c.title}>
            <CardHeader><CardTitle>{c.title}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold text-muted-foreground">-</div><p className="text-xs text-muted-foreground">{c.note}. Available after Phase 4.</p></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
