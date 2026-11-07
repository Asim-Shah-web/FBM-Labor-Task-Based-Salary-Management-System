import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/server/money/decimal";
import type { DayRow } from "@/server/services/balance.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";

type Totals = { taskEarnings: string; allowance: string; earned: string; settled: string; outstanding: string };

/** Per-date earned / settled / outstanding with Paid / Partially Paid / Unpaid labels. */
export function StatementTable({ rows, totals }: { rows: DayRow[]; totals: Totals }) {
  if (rows.length === 0) return <Card className="p-6 text-center text-sm text-muted-foreground">No approved earnings in this period.</Card>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Tasks</th><th className="px-3 py-2 text-right">Allowance</th>
            <th className="px-3 py-2 text-right">Earned</th><th className="px-3 py-2 text-right">Settled</th>
            <th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-b last:border-0">
              <td className="px-3 py-2">{formatDate(r.date)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPKR(r.taskEarnings)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPKR(r.allowance)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPKR(r.earned)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPKR(r.settled)}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{formatPKR(r.outstanding)}</td>
              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-muted/50 font-medium">
          <tr>
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPKR(totals.taskEarnings)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPKR(totals.allowance)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPKR(totals.earned)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPKR(totals.settled)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPKR(totals.outstanding)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
