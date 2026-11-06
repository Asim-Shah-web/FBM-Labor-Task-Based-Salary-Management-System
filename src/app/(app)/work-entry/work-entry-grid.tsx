"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createEntriesAction } from "@/app/actions/daily";
import { formatPKR, lineAmount, sum } from "@/server/money/decimal";
import { validateQuantity } from "@/server/services/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";

type W = { id: string; code: string; name: string };
type T = { id: string; code: string; name: string; pricingMethod: "PER_UNIT" | "FIXED_PER_TASK"; unitLabel: string | null; rate: string | null };
type Row = { key: number; workerId: string; taskId: string; quantity: string };

let nextKey = 1;
const emptyRow = (workerId = ""): Row => ({ key: nextKey++, workerId, taskId: "", quantity: "" });

export function WorkEntryGrid({ date, workers, tasks }: { date: string; workers: W[]; tasks: T[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Preview only. The server recalculates everything from the stored rate history.
  const preview = (r: Row) => {
    const t = taskById.get(r.taskId);
    if (!t?.rate || !r.quantity.trim() || validateQuantity(t.pricingMethod, r.quantity.replace(/,/g, ""))) return null;
    return lineAmount(r.quantity.replace(/,/g, ""), t.rate);
  };
  const total = sum(rows.map((r) => preview(r) ?? 0));
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = (approve: boolean) => {
    const incomplete = rows.some((r) => !r.workerId || !r.taskId || !r.quantity.trim());
    if (incomplete) return setFeedback({ ok: false, text: "Complete every line (worker, task and quantity) or remove it." });
    start(async () => {
      setFeedback(null);
      const res = await createEntriesAction({ workDate: date, approve, lines: rows.map((r) => ({ workerId: r.workerId, taskId: r.taskId, quantity: r.quantity })) });
      setFeedback({ ok: res.ok, text: res.ok ? res.message ?? "Saved." : res.error });
      if (res.ok) { setRows([emptyRow()]); router.refresh(); }
    });
  };

  if (workers.length === 0 || tasks.length === 0)
    return <Card className="p-6 text-sm text-muted-foreground">Add at least one active worker and one active task before entering work.</Card>;

  return (
    <Card>
      <CardHeader><CardTitle>Add work for this day</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const t = taskById.get(r.taskId);
          const amt = preview(r);
          return (
            <div key={r.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.4fr_1.4fr_7rem_8rem_auto] sm:items-center sm:border-0 sm:p-0">
              <NativeSelect aria-label={`Worker, line ${i + 1}`} value={r.workerId} onChange={(e) => update(r.key, { workerId: e.target.value })}>
                <option value="">Worker...</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
              </NativeSelect>
              <NativeSelect aria-label={`Task, line ${i + 1}`} value={r.taskId} onChange={(e) => update(r.key, { taskId: e.target.value })}>
                <option value="">Task...</option>
                {tasks.map((tk) => (
                  <option key={tk.id} value={tk.id} disabled={!tk.rate}>
                    {tk.name}{tk.rate ? ` (${formatPKR(tk.rate)}${tk.pricingMethod === "PER_UNIT" ? `/${tk.unitLabel ?? "unit"}` : " each"})` : " (no rate)"}
                  </option>
                ))}
              </NativeSelect>
              <Input
                aria-label={`Quantity, line ${i + 1}`} inputMode={t?.pricingMethod === "FIXED_PER_TASK" ? "numeric" : "decimal"}
                placeholder={t?.pricingMethod === "FIXED_PER_TASK" ? "Tasks" : "Qty"} value={r.quantity}
                onChange={(e) => update(r.key, { quantity: e.target.value })}
              />
              <div className="text-right text-sm font-medium tabular-nums">{amt ? formatPKR(amt) : <span className="text-muted-foreground">-</span>}</div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow(rs[rs.length - 1]?.workerId ?? "")])}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
          <div className="text-sm">Preview total: <b>{formatPKR(total)}</b> <span className="text-xs text-muted-foreground">(server recalculates)</span></div>
        </div>

        <FeedbackMessage feedback={feedback} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" disabled={pending} onClick={() => submit(true)}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Save &amp; approve</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => submit(false)}>Save as draft</Button>
        </div>
      </CardContent>
    </Card>
  );
}
