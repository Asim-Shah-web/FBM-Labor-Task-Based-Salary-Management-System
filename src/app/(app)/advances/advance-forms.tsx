"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { issueAdvanceAction, voidAdvanceAction } from "@/app/actions/finance";
import { parseMoney } from "@/server/money/decimal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";

export function IssueAdvanceForm({ workers, today }: { workers: { id: string; name: string; code: string }[]; today: string }) {
  const router = useRouter();
  const [workerId, setWorkerId] = useState("");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const submit = () => {
    const amt = parseMoney(amount);
    if (!workerId) return setFeedback({ ok: false, text: "Choose a worker." });
    if (!amt || amt.lte(0)) return setFeedback({ ok: false, text: "Enter an amount greater than zero." });
    start(async () => {
      const r = await issueAdvanceAction({ workerId, advanceDate: date, amount: amt.toFixed(2), notes: notes.trim() || undefined });
      setFeedback({ ok: r.ok, text: r.ok ? r.message ?? "Saved." : r.error });
      if (r.ok) { setAmount(""); setNotes(""); router.refresh(); }
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Issue an advance</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="adv-worker">Worker</Label>
            <NativeSelect id="adv-worker" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Choose...</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </NativeSelect></div>
          <div className="flex flex-col gap-2"><Label htmlFor="adv-date">Date</Label><Input id="adv-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="adv-amt">Amount (PKR)</Label><Input id="adv-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </div>
        <div className="flex flex-col gap-2"><Label htmlFor="adv-notes">Notes (optional)</Label><Input id="adv-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></div>
        <FeedbackMessage feedback={feedback} />
        <Button className="sm:self-start" disabled={pending} onClick={submit}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Record advance</Button>
      </CardContent>
    </Card>
  );
}

export function VoidAdvanceButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => {
        const reason = prompt("Reason for voiding this advance (required):");
        if (!reason) return;
        start(async () => {
          const r = await voidAdvanceAction(id, reason);
          if (!r.ok) setError(r.error); else router.refresh();
        });
      }}>Void</Button>
      {error && <p role="alert" className="max-w-48 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
