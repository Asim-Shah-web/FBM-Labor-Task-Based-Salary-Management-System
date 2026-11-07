import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePagePermission } from "@/server/authz/require";
import { getPayment } from "@/server/services/settlement.service";
import { formatPKR, money } from "@/server/money/decimal";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReverseForm } from "./reverse-form";

export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("settlement:read");
  const { id } = await params;
  const p = await getPayment(id);
  if (!p) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:gap-6">
      <PageHeader
        title={`Settlement ${p.receiptNo}`}
        description={`${p.worker.fullName} (${p.worker.code})`}
        actions={<Button asChild variant="outline"><Link href="/salary">Back to salary</Link></Button>}
      />

      {p.status === "REVERSED" && (
        <p role="status" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <b>Reversed</b> by {p.reversedBy} on {p.reversedAt ? formatDate(p.reversedAt.slice(0, 10)) : ""}. Reason: {p.reversalReason}. The wages below are outstanding again.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Payment details {p.status === "REVERSED" && <Badge variant="danger" className="ml-2">Reversed</Badge>}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
            <dt className="text-muted-foreground">Payment date</dt><dd>{formatDate(p.paymentDate)}</dd>
            <dt className="text-muted-foreground">Work period</dt><dd>{formatDate(p.periodStart)} to {formatDate(p.periodEnd)}</dd>
            <dt className="text-muted-foreground">Cash paid</dt><dd className="font-semibold">{formatPKR(p.cash)}</dd>
            <dt className="text-muted-foreground">Advance recovered</dt><dd>{formatPKR(p.recovery)}</dd>
            <dt className="text-muted-foreground">Total settled</dt><dd className="font-semibold">{formatPKR(p.total)}</dd>
            <dt className="text-muted-foreground">Recorded by</dt><dd>{p.recordedBy}</dd>
            <dt className="text-muted-foreground">Notes</dt><dd className="sm:col-span-3">{p.notes ?? "-"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>How it was applied (permanent record)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="border-y bg-muted/50 text-left"><tr>
              <th className="px-4 py-2">Work date</th><th className="px-4 py-2">Source</th><th className="px-4 py-2 text-right">Earned</th>
              <th className="px-4 py-2 text-right">Cash applied</th><th className="px-4 py-2 text-right">Advance recovered</th>
            </tr></thead>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2">{formatDate(l.date)}</td>
                  <td className="px-4 py-2">{l.source === "TASK_ENTRY" ? "Task earnings" : "Daily allowance"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPKR(l.earned)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(l.cash).gt(0) ? formatPKR(l.cash) : "-"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(l.recovery).gt(0) ? formatPKR(l.recovery) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {p.status === "POSTED" && can(user, "settlement:reverse") && <ReverseForm paymentId={p.id} />}
    </div>
  );
}
