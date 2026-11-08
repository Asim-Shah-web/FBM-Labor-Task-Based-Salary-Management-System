"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { runIntegrityCheckAction } from "@/app/actions/audit";
import type { CheckResult } from "@/server/services/reconcile.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function IntegrityCheck() {
  const [pending, start] = useTransition();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader><CardTitle>Financial integrity check</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Recomputes balances from the permanent payment and entry history and compares them with the stored totals. Read-only and safe to run any time.</p>
        <Button className="self-start" disabled={pending} onClick={() => start(async () => {
          setError(null);
          const r = await runIntegrityCheckAction();
          if (r.ok && r.data) setResults(r.data); else setError(r.ok ? "No result." : r.error);
        })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Run check
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {results && (
          <ul className="flex flex-col gap-2 text-sm">
            {results.map((r) => (
              <li key={r.id} className="flex items-start gap-2">
                {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div><div>{r.name}{!r.ok && <b className="text-destructive"> ({r.count} problem{r.count === 1 ? "" : "s"})</b>}</div>
                  {r.sample.map((s) => <div key={s} className="font-mono text-xs text-muted-foreground">{s}</div>)}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
