import Link from "next/link";
import { can, requirePagePermission } from "@/server/authz/require";
import { listWorkers } from "@/server/services/worker.service";
import { advanceTotals, listAdvances } from "@/server/services/advance.service";
import { formatPKR, money } from "@/server/money/decimal";
import { formatDate, todayKarachi } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IssueAdvanceForm, VoidAdvanceButton } from "./advance-forms";

export const metadata = { title: "Advances" };
export const dynamic = "force-dynamic";

export default async function AdvancesPage({ searchParams }: { searchParams: Promise<{ worker?: string }> }) {
  const user = await requirePagePermission("advance:read");
  const { worker } = await searchParams;
  const [workers, advances, totals] = await Promise.all([listWorkers({ status: "ACTIVE" }), listAdvances({ workerId: worker || undefined }), advanceTotals(worker || undefined)]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <PageHeader title="Advances" description="Cash given before wages are earned. Advances are not wages; they are recovered only when you choose, during a salary settlement." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader><CardTitle>Total issued</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(totals.issued)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Recovered</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(totals.recovered)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Unrecovered balance</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold">{formatPKR(totals.unrecovered)}</div></CardContent></Card>
      </div>

      {can(user, "advance:issue") && <IssueAdvanceForm today={todayKarachi()} workers={workers.map((w) => ({ id: w.id, name: w.fullName, code: w.code }))} />}

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Advance history</CardTitle>
          <form method="get" className="flex gap-2">
            <NativeSelect name="worker" defaultValue={worker ?? ""} aria-label="Filter by worker" className="sm:w-56">
              <option value="">All workers</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.fullName} ({w.code})</option>)}
            </NativeSelect>
            <Button type="submit" variant="outline">Filter</Button>
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          {advances.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No advances recorded.</p> : (
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-y bg-muted/50 text-left"><tr>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Worker</th><th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Recovered</th><th className="px-4 py-2 text-right">Outstanding</th><th className="px-4 py-2">Notes</th><th className="px-4 py-2" />
              </tr></thead>
              <tbody>
                {advances.map((a) => (
                  <tr key={a.id} className={`border-b last:border-0 ${a.status === "VOIDED" ? "text-muted-foreground" : ""}`}>
                    <td className="px-4 py-2">{formatDate(a.advanceDate)}</td>
                    <td className="px-4 py-2"><Link href={`/workers/${a.workerId}`} className="text-primary hover:underline">{a.workerName}</Link></td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPKR(a.amount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPKR(a.recovered)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{a.status === "VOIDED" ? <StatusBadge status="VOIDED" /> : formatPKR(a.outstanding)}</td>
                    <td className="px-4 py-2">{a.status === "VOIDED" ? `Voided: ${a.voidReason}` : a.notes ?? "-"}</td>
                    <td className="px-4 py-2 text-right">{a.status === "ACTIVE" && money(a.recovered).eq(0) && can(user, "advance:void") && <VoidAdvanceButton id={a.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
