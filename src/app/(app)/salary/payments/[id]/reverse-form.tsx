"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { reverseSettlementAction } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";

export function ReverseForm({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  return (
    <Card>
      <CardHeader><CardTitle>Correct a mistake</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Payments are never edited or deleted. To fix one, reverse it completely (it stays on record as reversed) and record a new settlement.</p>
        {!open ? (
          <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>Reverse this settlement</Button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2"><Label htmlFor="reason">Reason (required)</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong amount entered" /></div>
            <FeedbackMessage feedback={feedback} />
            <div className="flex gap-2">
              <Button variant="destructive" disabled={pending} onClick={() => {
                if (!confirm("Reverse this settlement? The wages and any advance recovery will become outstanding again.")) return;
                start(async () => {
                  const r = await reverseSettlementAction(paymentId, reason);
                  if (!r.ok) return setFeedback({ ok: false, text: r.error });
                  router.refresh();
                });
              }}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm reversal</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
