"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { postSettlementAction } from "@/app/actions/finance";
import { allocateOldestFirst } from "@/server/services/allocation.engine";
import { formatPKR, money, parseMoney, sum } from "@/server/money/decimal";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";

type Row = { date: string; outstanding: string };

export function SettleForm({
  workerId, periodStart, periodEnd, today, rows, outstanding, advanceUnrecovered,
}: { workerId: string; periodStart: string; periodEnd: string; today: string; rows: Row[]; outstanding: string; advanceUnrecovered: string }) {
  const router = useRouter();
  const [paymentDate, setPaymentDate] = useState(today);
  const [cash, setCash] = useState("");
  const [recovery, setRecovery] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  // One key per form load: a double-click or retry cannot create two payments.
  const key = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const cashAmt = parseMoney(cash || "0");
  const recAmt = parseMoney(recovery || "0");
  const valid = cashAmt && recAmt && cashAmt.gte(0) && recAmt.gte(0);
  const total = valid ? cashAmt.plus(recAmt) : money(0);
  const advLimit = money(advanceUnrecovered);
  const tooMuch = valid && total.gt(outstanding);
  const recTooMuch = valid && recAmt.gt(advLimit);

  // Preview only (date-level). The server recomputes with row locks and is authoritative.
  const preview = useMemo(() => {
    if (!valid || total.lte(0) || tooMuch || recTooMuch) return null;
    const lines = allocateOldestFirst(rows.map((r) => ({ id: r.date, workDate: r.date, createdAt: "", outstanding: r.outstanding })), cashAmt, recAmt);
    const byDate = new Map(lines.map((l) => [l.workDate, l.cash.plus(l.recovery)]));
    return rows.map((r) => {
      const alloc = byDate.get(r.date) ?? money(0);
      return { date: r.date, outstanding: r.outstanding, alloc: alloc.toString(), remaining: money(r.outstanding).minus(alloc).toString() };
    });
  }, [valid, total, tooMuch, recTooMuch, rows, cashAmt, recAmt]);

  const submit = () => {
    if (!valid || total.lte(0)) return setFeedback({ ok: false, text: "Enter a valid cash amount or advance recovery." });
    if (!confirm(`Record a settlement of ${formatPKR(cashAmt!)} cash${recAmt!.gt(0) ? ` plus ${formatPKR(recAmt!)} advance recovery` : ""} for this period?`)) return;
    start(async () => {
      setFeedback(null);
      const r = await postSettlementAction({
        workerId, paymentDate, periodStart, periodEnd,
        cashAmount: cashAmt!.toFixed(2), advanceRecoveryAmount: recAmt!.toFixed(2), notes: notes.trim() || undefined, idempotencyKey: key.current,
      });
      if (!r.ok) return setFeedback({ ok: false, text: r.error });
      router.push(`/salary/payments/${r.data?.id ?? ""}`);
    });
  };

  if (money(outstanding).lte(0))
    return <Card className="p-4 text-sm text-muted-foreground">Nothing is outstanding in this period. Choose a different period.</Card>;

  return (
    <Card>
      <CardHeader><CardTitle>Record payment</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">Outstanding for this period: <b>{formatPKR(outstanding)}</b></p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2"><Label htmlFor="paydate">Payment date</Label>
            <Input id="paydate" type="date" value={paymentDate} max={today} onChange={(e) => setPaymentDate(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="cash">Cash paid (PKR)</Label>
            <Input id="cash" inputMode="decimal" placeholder="0" value={cash} onChange={(e) => setCash(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="rec">Advance recovered (PKR)</Label>
            <Input id="rec" inputMode="decimal" placeholder="0" value={recovery} onChange={(e) => setRecovery(e.target.value)} disabled={advLimit.lte(0)} />
            <p className="text-xs text-muted-foreground">{advLimit.gt(0) ? `Worker owes ${formatPKR(advLimit)} in advances. Recovery is only applied when you enter it.` : "No unrecovered advance."}</p></div>
        </div>
        <div className="flex flex-col gap-2"><Label htmlFor="notes">Notes (optional)</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} /></div>

        {tooMuch && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">This is more than the outstanding wages for the period ({formatPKR(outstanding)}). Extra money must be recorded as an advance.</p>}
        {recTooMuch && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Recovery is more than the worker&apos;s unrecovered advance.</p>}

        {preview && (
          <div className="overflow-x-auto rounded-md border">
            <p className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">How this payment will be applied (oldest dates first)</p>
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2 text-right">Applied</th><th className="px-3 py-2 text-right">Remaining</th></tr></thead>
              <tbody>{preview.map((p) => (
                <tr key={p.date} className="border-t">
                  <td className="px-3 py-2">{formatDate(p.date)}</td><td className="px-3 py-2 text-right tabular-nums">{formatPKR(p.outstanding)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPKR(p.alloc)}</td><td className="px-3 py-2 text-right font-medium tabular-nums">{formatPKR(p.remaining)}</td>
                </tr>))}
              </tbody>
              <tfoot className="border-t bg-muted/50 font-medium"><tr>
                <td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{formatPKR(sum(preview.map((p) => p.outstanding)))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPKR(sum(preview.map((p) => p.alloc)))}</td><td className="px-3 py-2 text-right tabular-nums">{formatPKR(sum(preview.map((p) => p.remaining)))}</td>
              </tr></tfoot>
            </table>
          </div>
        )}

        <FeedbackMessage feedback={feedback} />
        <Button type="button" className="sm:self-start" disabled={pending || !valid || total.lte(0) || !!tooMuch || !!recTooMuch} onClick={submit}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Record settlement
        </Button>
      </CardContent>
    </Card>
  );
}
