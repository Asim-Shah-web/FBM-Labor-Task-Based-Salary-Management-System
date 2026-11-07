import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, requirePagePermission } from "@/server/authz/require";
import { getWorker } from "@/server/services/worker.service";
import { earliestOutstandingDate, getPeriodStatement } from "@/server/services/balance.service";
import { advanceTotals } from "@/server/services/advance.service";
import { formatPKR } from "@/server/money/decimal";
import { isValidIsoDate, todayKarachi } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { StatementTable } from "@/components/shared/statement-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettleForm } from "./settle-form";

export const metadata = { title: "Settle salary" };
export const dynamic = "force-dynamic";

export default async function SettlePage({ searchParams }: { searchParams: Promise<{ worker?: string; start?: string; end?: string }> }) {
  const user = await requirePagePermission("settlement:read");
  const sp = await searchParams;
  if (!sp.worker) redirect("/salary");
  const worker = await getWorker(sp.worker);
  if (!worker) notFound();

  const today = todayKarachi();
  const earliest = await earliestOutstandingDate(worker.id);
  const end = sp.end && isValidIsoDate(sp.end) && sp.end <= today ? sp.end : today;
  const start = sp.start && isValidIsoDate(sp.start) ? sp.start : earliest ?? `${today.slice(0, 7)}-01`;

  const [statement, adv] = await Promise.all([getPeriodStatement(worker.id, start, end), advanceTotals(worker.id)]);
  const canSettle = can(user, "settlement:create");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-6">
      <PageHeader title={`Settle salary: ${worker.fullName}`} description={`${worker.code}. Choose the exact work period being paid.`}
        actions={<Button asChild variant="outline"><Link href="/salary">Back</Link></Button>} />

      <Card>
        <CardHeader><CardTitle>Work period</CardTitle></CardHeader>
        <CardContent>
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="worker" value={worker.id} />
            <div className="flex flex-col gap-2"><Label htmlFor="start">From</Label><Input id="start" name="start" type="date" defaultValue={start} max={today} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="end">To</Label><Input id="end" name="end" type="date" defaultValue={end} max={today} /></div>
            <Button type="submit" variant="outline">Show period</Button>
          </form>
        </CardContent>
      </Card>

      <StatementTable rows={statement.rows} totals={statement.totals} />

      {canSettle ? (
        <SettleForm
          workerId={worker.id}
          periodStart={start}
          periodEnd={end}
          today={today}
          rows={statement.rows.map((r) => ({ date: r.date, outstanding: r.outstanding }))}
          outstanding={statement.totals.outstanding}
          advanceUnrecovered={adv.unrecovered}
          key={`${start}|${end}`}
        />
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">You do not have permission to record settlements. Outstanding for this period: {formatPKR(statement.totals.outstanding)}.</Card>
      )}
    </div>
  );
}
