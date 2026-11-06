"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveAttendanceAction } from "@/app/actions/daily";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";

type Status = "PRESENT" | "ABSENT" | "LEAVE";
type W = { id: string; code: string; name: string; department: string | null };

const OPTIONS: { value: Status; label: string; on: string }[] = [
  { value: "PRESENT", label: "Present", on: "bg-emerald-600 text-white border-emerald-600" },
  { value: "ABSENT", label: "Absent", on: "bg-red-600 text-white border-red-600" },
  { value: "LEAVE", label: "Leave", on: "bg-blue-600 text-white border-blue-600" },
];

export function AttendanceGrid({ date, workers, initial, canWrite }: { date: string; workers: W[]; initial: Record<string, Status>; canWrite: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState<Record<string, Status>>(initial);
  const [current, setCurrent] = useState<Record<string, Status | undefined>>(initial);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const changed = useMemo(() => workers.filter((w) => current[w.id] && current[w.id] !== saved[w.id]), [workers, current, saved]);
  const count = (s: Status) => workers.filter((w) => current[w.id] === s).length;
  const unmarked = workers.filter((w) => !current[w.id]).length;

  const save = () =>
    start(async () => {
      setFeedback(null);
      const rows = changed.map((w) => ({ workerId: w.id, status: current[w.id]! }));
      const r = await saveAttendanceAction({ date, rows });
      setFeedback({ ok: r.ok, text: r.ok ? r.message ?? "Saved." : r.error });
      if (r.ok) {
        setSaved((prev) => ({ ...prev, ...Object.fromEntries(rows.map((x) => [x.workerId, x.status])) }));
        router.refresh();
      }
    });

  if (workers.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">No active workers. Add workers first.</Card>;

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-sm">
        <span>Present: <b>{count("PRESENT")}</b></span>
        <span>Absent: <b>{count("ABSENT")}</b></span>
        <span>Leave: <b>{count("LEAVE")}</b></span>
        <span>Not marked: <b>{unmarked}</b></span>
        {canWrite && (
          <Button
            type="button" variant="outline" size="sm" className="ml-auto" disabled={unmarked === 0}
            onClick={() => setCurrent((prev) => Object.fromEntries(workers.map((w) => [w.id, prev[w.id] ?? "PRESENT"])))}
          >
            Mark unmarked as Present
          </Button>
        )}
      </Card>

      <div className="flex flex-col gap-2">
        {workers.map((w) => {
          const value = current[w.id];
          const isChanged = value && value !== saved[w.id];
          return (
            <Card key={w.id} className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between", isChanged && "border-primary")}>
              <div className="min-w-0">
                <div className="truncate font-medium">{w.name}</div>
                <div className="text-xs text-muted-foreground">{w.code}{w.department ? ` · ${w.department}` : ""}</div>
              </div>
              <div role="radiogroup" aria-label={`Attendance for ${w.name}`} className="grid grid-cols-3 gap-2 sm:w-80">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={!canWrite}
                    onClick={() => setCurrent((p) => ({ ...p, [w.id]: o.value }))}
                    className={cn("h-11 rounded-md border text-sm font-medium transition-colors disabled:opacity-60", value === o.value ? o.on : "bg-background hover:bg-accent")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {canWrite && (
        <div className="sticky bottom-0 -mx-3 flex flex-col gap-2 border-t bg-card/95 p-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <FeedbackMessage feedback={feedback} />
          <Button type="button" onClick={save} disabled={pending || changed.length === 0}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {changed.length === 0 ? "No changes to save" : `Save attendance (${changed.length} change${changed.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      )}
    </div>
  );
}
