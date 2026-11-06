"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkerStatusAction } from "@/app/actions/workers";
import { Button } from "@/components/ui/button";

export function WorkerStatusButton({ workerId, status }: { workerId: string; status: "ACTIVE" | "INACTIVE" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={status === "ACTIVE" ? "outline" : "default"}
        disabled={pending}
        onClick={() => {
          if (next === "INACTIVE" && !confirm("Deactivate this worker? Their history is kept, but they will not appear in daily entry screens.")) return;
          start(async () => {
            const r = await setWorkerStatusAction(workerId, next);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        {status === "ACTIVE" ? "Deactivate" : "Activate"}
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
