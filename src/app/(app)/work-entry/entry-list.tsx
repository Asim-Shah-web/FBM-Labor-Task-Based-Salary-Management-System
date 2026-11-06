"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { approveDayAction, approveEntryAction, correctEntryAction, voidEntryAction } from "@/app/actions/daily";
import { formatPKR } from "@/server/money/decimal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";
import type { EntryRow } from "@/server/services/work-entry.service";

export function ApproveDayButton({ date, draftCount }: { date: string; draftCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <div className="flex w-full flex-col gap-2">
      <Button type="button" disabled={pending || draftCount === 0} onClick={() => start(async () => {
        const r = await approveDayAction(date);
        setFeedback({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error });
        if (r.ok) router.refresh();
      })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve all drafts ({draftCount})
      </Button>
      <FeedbackMessage feedback={feedback} />
    </div>
  );
}

function EntryActions({ entry }: { entry: EntryRow }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "correct" | "void">(null);
  const [qty, setQty] = useState(entry.quantity);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setMode(null); setReason(""); setFeedback(null); router.refresh(); }
      else setFeedback({ ok: false, text: r.error ?? "Failed." });
    });

  if (entry.status === "VOIDED") return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {entry.status === "DRAFT" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => approveEntryAction(entry.id))}>Approve</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setMode(mode === "correct" ? null : "correct")}>Correct</Button>
        <Button size="sm" variant="outline" onClick={() => setMode(mode === "void" ? null : "void")}>Void</Button>
      </div>
      {mode && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3 sm:flex-row sm:items-end">
          {mode === "correct" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">New quantity</label>
              <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className="sm:w-28" />
            </div>
          )}
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium">Reason (required)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "void" ? "e.g. entered for wrong worker" : "e.g. miscounted"} />
          </div>
          <Button
            size="sm" disabled={pending} variant={mode === "void" ? "destructive" : "default"}
            onClick={() => run(() => (mode === "void" ? voidEntryAction(entry.id, reason) : correctEntryAction(entry.id, qty, reason)))}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "void" ? "Confirm void" : "Save correction"}
          </Button>
        </div>
      )}
      <FeedbackMessage feedback={feedback} />
    </div>
  );
}

export function EntryList({ entries, canWrite }: { entries: EntryRow[]; canWrite: boolean }) {
  if (entries.length === 0) return <Card className="p-6 text-center text-sm text-muted-foreground">No work entries for this date yet.</Card>;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Entries for this date</h2>
      {entries.map((e) => (
        <Card key={e.id} className={cn("flex flex-col gap-2 p-3", e.status === "VOIDED" && "opacity-60")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{e.workerName} <span className="text-xs font-normal text-muted-foreground">{e.workerCode}</span></div>
              <div className="text-sm text-muted-foreground">
                {e.taskName}: {e.quantity}{e.unitLabel && e.pricingMethod === "PER_UNIT" ? ` ${e.unitLabel}` : ""} × {formatPKR(e.appliedRate)}
              </div>
            </div>
            <div className="text-right">
              <div className={cn("font-semibold tabular-nums", e.status === "VOIDED" && "line-through")}>{formatPKR(e.amount)}</div>
              <StatusBadge status={e.status} />
            </div>
          </div>
          {e.status === "VOIDED" && e.voidReason && <p className="text-xs text-muted-foreground">Reason: {e.voidReason}</p>}
          {canWrite && <EntryActions entry={e} />}
        </Card>
      ))}
    </div>
  );
}
