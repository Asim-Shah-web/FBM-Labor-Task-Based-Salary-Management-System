"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveAllowancesAction } from "@/app/actions/daily";
import { cn } from "@/lib/utils";
import { formatPKR, money } from "@/server/money/decimal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";

type W = { id: string; code: string; name: string };
type Existing = { id: string; amount: string; reason: string | null; status: "DRAFT" | "APPROVED" | "VOIDED" };
type Cell = { amount: string; reason: string };

const REASONS = ["Machine breakdown", "Production stopped", "Waiting time", "Other approved compensation"];

export function AllowanceGrid({ date, workers, existing, canWrite }: { date: string; workers: W[]; existing: Record<string, Existing>; canWrite: boolean }) {
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(workers.map((w) => [w.id, { amount: existing[w.id]?.amount ?? "", reason: existing[w.id]?.reason ?? "" }])) as Record<string, Cell>,
    [workers, existing],
  );
  const [cells, setCells] = useState<Record<string, Cell>>(initial);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const isDirty = (id: string) => {
    const c = cells[id], o = initial[id];
    if (!c || !o || c.amount.trim() === "") return false;
    let same = false;
    try { same = o.amount !== "" && money(c.amount.replace(/,/g, "")).eq(money(o.amount)); } catch { same = false; }
    return !(same && c.reason.trim() === o.reason);
  };
  const dirty = workers.filter((w) => isDirty(w.id));
  const set = (id: string, patch: Partial<Cell>) => setCells((p) => ({ ...p, [id]: { ...p[id]!, ...patch } }));

  const save = () =>
    start(async () => {
      setFeedback(null);
      const rows = dirty.map((w) => ({ workerId: w.id, amount: cells[w.id]!.amount, reason: cells[w.id]!.reason.trim() || undefined }));
      const r = await saveAllowancesAction({ workDate: date, rows });
      setFeedback({ ok: r.ok, text: r.ok ? r.message ?? "Saved." : r.error });
      if (r.ok) router.refresh();
    });

  if (workers.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">No active workers.</Card>;

  return (
    <div className="flex flex-col gap-3">
      <datalist id="allowance-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
      <div className="flex flex-col gap-2">
        {workers.map((w) => {
          const ex = existing[w.id];
          return (
            <Card key={w.id} className={cn("grid gap-2 p-3 sm:grid-cols-[1.2fr_9rem_1.4fr] sm:items-center", isDirty(w.id) && "border-primary")}>
              <div className="min-w-0">
                <div className="truncate font-medium">{w.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {w.code}
                  {ex && <><StatusBadge status={ex.status} /><span>current {formatPKR(ex.amount)}</span></>}
                </div>
              </div>
              <Input
                aria-label={`Allowance for ${w.name}`} inputMode="decimal" placeholder="Rs. 0" disabled={!canWrite}
                value={cells[w.id]?.amount ?? ""} onChange={(e) => set(w.id, { amount: e.target.value })}
              />
              <Input
                aria-label={`Reason for ${w.name}`} list="allowance-reasons" placeholder="Reason (optional)" disabled={!canWrite}
                value={cells[w.id]?.reason ?? ""} onChange={(e) => set(w.id, { reason: e.target.value })}
              />
            </Card>
          );
        })}
      </div>
      {canWrite && (
        <div className="sticky bottom-0 -mx-3 flex flex-col gap-2 border-t bg-card/95 p-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <p className="text-xs text-muted-foreground">Leave blank for no allowance. Enter 0 to cancel an existing one.</p>
          <FeedbackMessage feedback={feedback} />
          <Button type="button" onClick={save} disabled={pending || dirty.length === 0}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {dirty.length === 0 ? "No changes to save" : `Save allowances (${dirty.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}
