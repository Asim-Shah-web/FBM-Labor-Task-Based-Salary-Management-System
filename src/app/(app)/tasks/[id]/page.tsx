import { notFound } from "next/navigation";
import { can, requirePagePermission } from "@/server/authz/require";
import { getTaskDetail } from "@/server/services/task.service";
import { formatPKR } from "@/server/money/decimal";
import { formatDate, todayKarachi } from "@/lib/dates";
import { pickRate } from "@/server/services/pricing";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangeRateForm, EditTaskForm, TaskActiveButton } from "../task-forms";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("work:read");
  const { id } = await params;
  const task = await getTaskDetail(id);
  if (!task) notFound();
  const today = todayKarachi();
  const current = pickRate(task.rates, today);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-6">
      <PageHeader
        title={task.name}
        description={`${task.code} · ${task.pricingMethod === "PER_UNIT" ? `Per ${task.unitLabel ?? "unit"}` : "Fixed amount per completed task"} · ${task.entryCount} active entries`}
        actions={can(user, "task:write") && <TaskActiveButton taskId={id} isActive={task.isActive} />}
      />

      <Card>
        <CardHeader><CardTitle>Current rate</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-semibold">{current ? formatPKR(current.rate) : "No rate in effect"}</span>
          <StatusBadge status={task.isActive ? "ACTIVE" : "INACTIVE"} />
          {current && <span className="text-sm text-muted-foreground">since {formatDate(current.effectiveFrom)}</span>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {can(user, "rate:change") && <ChangeRateForm taskId={id} today={today} />}
        {can(user, "task:write") && <EditTaskForm taskId={id} defaults={{ name: task.name, unitLabel: task.unitLabel ?? "" }} />}
      </div>

      <Card>
        <CardHeader><CardTitle>Rate history</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/50 text-left"><tr>
              <th className="px-4 py-2">Effective from</th><th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2">Reason</th><th className="px-4 py-2">Changed by</th>
            </tr></thead>
            <tbody>
              {task.rates.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{formatDate(r.effectiveFrom)} {current?.id === r.id && <Badge variant="success" className="ml-1">current</Badge>}</td>
                  <td className="px-4 py-2 text-right">{formatPKR(r.rate)}</td>
                  <td className="px-4 py-2">{r.reason ?? "-"}</td><td className="px-4 py-2">{r.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
