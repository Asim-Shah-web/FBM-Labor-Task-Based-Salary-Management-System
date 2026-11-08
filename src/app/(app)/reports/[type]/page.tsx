import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { can, requirePagePermission } from "@/server/authz/require";
import { DomainError } from "@/server/errors";
import { REPORTS, isReportType, type FilterKey } from "@/lib/reports/definitions";
import { parseParams, resolveAsOf } from "@/lib/reports/period";
import { todayKarachi } from "@/lib/dates";
import { buildReport } from "@/server/services/report.service";
import { listDepartments, listWorkers } from "@/server/services/worker.service";
import { listTasks } from "@/server/services/task.service";
import { PageHeader } from "@/components/shared/page-header";
import { ReportView } from "@/components/shared/report-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePagePermission("report:read");
  const { type } = await params;
  if (!isReportType(type)) notFound();
  const meta = REPORTS.find((r) => r.type === type)!;
  const sp = await searchParams;
  const query = parseParams(sp);
  const today = todayKarachi();
  const f = (k: FilterKey) => meta.filters.includes(k);

  const [workers, departments, tasks] = await Promise.all([
    f("worker") || f("workerRequired") ? listWorkers({}) : Promise.resolve([]),
    f("department") ? listDepartments() : Promise.resolve([]),
    f("task") ? listTasks(today) : Promise.resolve([]),
  ]);

  let report = null, error: string | null = null;
  const hasInput = Object.keys(sp).length > 0 || !f("workerRequired");
  if (hasInput) {
    try { report = await buildReport(type, query, today); }
    catch (e) { if (e instanceof DomainError) error = e.message; else throw e; }
  }

  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]).toString();
  const canExport = can(user, "report:export");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader title={meta.title} description={meta.description} actions={<div className="print:hidden"><Button asChild variant="ghost"><a href="/reports">All reports</a></Button></div>} />

      <Card className="print:hidden">
        <CardContent className="p-4 sm:p-5">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {f("month") && <div className="flex flex-col gap-2"><Label htmlFor="month">Month</Label><Input id="month" name="month" type="month" defaultValue={query.month ?? today.slice(0, 7)} max={today.slice(0, 7)} /></div>}
            {f("period") && (<>
              <div className="flex flex-col gap-2"><Label htmlFor="month">Month (optional)</Label><Input id="month" name="month" type="month" defaultValue={query.month ?? ""} max={today.slice(0, 7)} /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="start">Or from</Label><Input id="start" name="start" type="date" defaultValue={query.start ?? ""} max={today} /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="end">to</Label><Input id="end" name="end" type="date" defaultValue={query.end ?? ""} max={today} /></div>
            </>)}
            {f("asOf") && <div className="flex flex-col gap-2"><Label htmlFor="asOf">As of date</Label><Input id="asOf" name="asOf" type="date" defaultValue={resolveAsOf(query, today)} max={today} /></div>}
            {(f("worker") || f("workerRequired")) && (
              <div className="flex flex-col gap-2"><Label htmlFor="workerId">Worker{f("workerRequired") ? " *" : ""}</Label>
                <NativeSelect id="workerId" name="workerId" defaultValue={query.workerId ?? ""}>
                  <option value="">{f("workerRequired") ? "Choose a worker..." : "All workers"}</option>
                  {workers.map((w) => <option key={w.id} value={w.id}>{w.fullName} ({w.code})</option>)}
                </NativeSelect></div>
            )}
            {f("department") && (
              <div className="flex flex-col gap-2"><Label htmlFor="department">Department</Label>
                <NativeSelect id="department" name="department" defaultValue={query.department ?? ""}>
                  <option value="">All departments</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </NativeSelect></div>
            )}
            {f("task") && (
              <div className="flex flex-col gap-2"><Label htmlFor="taskId">Task</Label>
                <NativeSelect id="taskId" name="taskId" defaultValue={query.taskId ?? ""}>
                  <option value="">All tasks</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </NativeSelect></div>
            )}
            <div className="flex items-end"><Button type="submit">Show report</Button></div>
          </form>
          {f("period") && <p className="mt-2 text-xs text-muted-foreground">If a month is chosen it is used; otherwise the date range. With neither, the current month so far is shown.</p>}
        </CardContent>
      </Card>

      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive print:hidden">{error}</p>}
      {!hasInput && <Card className="p-6 text-center text-sm text-muted-foreground print:hidden">Choose a worker and press Show report.</Card>}

      {report && (
        <>
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton />
            {canExport && (<>
              <Button asChild variant="outline"><a href={`/api/reports/${type}/export?format=xlsx${qs ? `&${qs}` : ""}`}><Download className="h-4 w-4" /> Excel</a></Button>
              <Button asChild variant="outline"><a href={`/api/reports/${type}/export?format=pdf${qs ? `&${qs}` : ""}`}><Download className="h-4 w-4" /> PDF</a></Button>
            </>)}
          </div>
          <ReportView report={report} />
        </>
      )}
    </div>
  );
}
