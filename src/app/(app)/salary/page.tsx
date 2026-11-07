import Link from "next/link";
import { can, requirePagePermission } from "@/server/authz/require";
import { listWorkerBalances } from "@/server/services/balance.service";
import { listPayments } from "@/server/services/settlement.service";
import { formatPKR, money, sum } from "@/server/money/decimal";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Salary Management" };
export const dynamic = "force-dynamic";

export default async function SalaryPage() {
  const user = await requirePagePermission("settlement:read");
  const [balances, payments] = await Promise.all([listWorkerBalances(), listPayments({ take: 30 })]);
  const canSettle = can(user, "settlement:create");
  const totalOutstanding = sum(balances.map((b) => b.outstanding));
  const totalAdvance = sum(balances.map((b) => b.advanceUnrecovered));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <PageHeader title="Salary Management" description="Pay workers for any period you choose. Payments are applied to the oldest unpaid work first." />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardHeader><CardTitle>Outstanding earned wages (all workers)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{formatPKR(totalOutstanding)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Unrecovered advances (shown separately)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{formatPKR(totalAdvance)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Worker balances</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          {balances.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing outstanding. Approved work will appear here.</p> : (
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-y bg-muted/50 text-left"><tr>
                <th className="px-4 py-2">Worker</th><th className="px-4 py-2 text-right">Earned</th><th className="px-4 py-2 text-right">Settled</th>
                <th className="px-4 py-2 text-right">Outstanding</th><th className="px-4 py-2 text-right">Advance owed</th><th className="px-4 py-2" />
              </tr></thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.workerId} className="border-b last:border-0">
                    <td className="px-4 py-2"><Link href={`/workers/${b.workerId}`} className="font-medium text-primary hover:underline">{b.name}</Link>
                      <span className="ml-2 text-xs text-muted-foreground">{b.code}</span>{b.status === "INACTIVE" && <Badge className="ml-2">Inactive</Badge>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPKR(b.earned)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPKR(b.settled)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatPKR(b.outstanding)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(b.advanceUnrecovered).gt(0) ? formatPKR(b.advanceUnrecovered) : "-"}</td>
                    <td className="px-4 py-2 text-right">
                      {canSettle && money(b.outstanding).gt(0) && <Button asChild size="sm"><Link href={`/salary/settle?worker=${b.workerId}`}>Settle</Link></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent settlements</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          {payments.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No settlements yet.</p> : (
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-y bg-muted/50 text-left"><tr>
                <th className="px-4 py-2">Receipt</th><th className="px-4 py-2">Paid on</th><th className="px-4 py-2">Worker</th>
                <th className="px-4 py-2">Work period</th><th className="px-4 py-2 text-right">Cash</th><th className="px-4 py-2 text-right">Advance recovered</th><th className="px-4 py-2" />
              </tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2"><Link href={`/salary/payments/${p.id}`} className="font-mono text-xs text-primary hover:underline">{p.receiptNo}</Link></td>
                    <td className="px-4 py-2">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-2">{p.workerName}</td>
                    <td className="px-4 py-2 text-xs">{formatDate(p.periodStart)} to {formatDate(p.periodEnd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPKR(p.cash)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(p.recovery).gt(0) ? formatPKR(p.recovery) : "-"}</td>
                    <td className="px-4 py-2">{p.status === "REVERSED" && <Badge variant="danger">Reversed</Badge>}</td>
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
