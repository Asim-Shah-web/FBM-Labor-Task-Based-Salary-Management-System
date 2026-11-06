import Link from "next/link";
import { Plus } from "lucide-react";
import { can, requirePagePermission } from "@/server/authz/require";
import { listTasks } from "@/server/services/task.service";
import { formatPKR } from "@/server/money/decimal";
import { formatDate, todayKarachi } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Tasks & Rates" };
export const dynamic = "force-dynamic";

const METHOD = { PER_UNIT: "Per unit", FIXED_PER_TASK: "Fixed per task" } as const;

export default async function TasksPage() {
  const user = await requirePagePermission("work:read");
  const tasks = await listTasks(todayKarachi());

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader
        title="Tasks & Rates"
        description="Each task has one standard rate for all workers. Rate changes never alter past entries."
        actions={can(user, "task:write") && <Button asChild><Link href="/tasks/new"><Plus className="h-4 w-4" /> Add task</Link></Button>}
      />
      {tasks.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No tasks yet. Add your first task (for example Stitching, Rs. 50 per unit).</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`}>
              <Card className="flex h-full flex-col gap-2 p-4 hover:border-primary/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{t.code}</div>
                  </div>
                  <StatusBadge status={t.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>
                <div className="text-2xl font-semibold">
                  {t.currentRate ? formatPKR(t.currentRate) : <span className="text-base text-destructive">No rate yet</span>}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {t.pricingMethod === "PER_UNIT" ? `per ${t.unitLabel ?? "unit"}` : "per completed task"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="info">{METHOD[t.pricingMethod]}</Badge>
                  {t.currentSince && <span>since {formatDate(t.currentSince)}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
