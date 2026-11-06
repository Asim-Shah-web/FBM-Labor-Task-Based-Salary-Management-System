import { can, requirePagePermission } from "@/server/authz/require";
import { listWorkers } from "@/server/services/worker.service";
import { listTasks } from "@/server/services/task.service";
import { listEntriesForDate } from "@/server/services/work-entry.service";
import { formatPKR, sum } from "@/server/money/decimal";
import { resolveDateParam, todayKarachi } from "@/lib/dates";
import { DatePicker } from "@/components/shared/date-picker";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { WorkEntryGrid } from "./work-entry-grid";
import { ApproveDayButton, EntryList } from "./entry-list";

export const metadata = { title: "Daily Work Entry" };
export const dynamic = "force-dynamic";

export default async function WorkEntryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePagePermission("work:read");
  const today = todayKarachi();
  const date = resolveDateParam((await searchParams).date, today);
  const canWrite = can(user, "work:write");

  const [workers, tasks, entries] = await Promise.all([listWorkers({ status: "ACTIVE" }), listTasks(date), listEntriesForDate(date)]);
  const activeTasks = tasks.filter((t) => t.isActive);
  const approved = entries.filter((e) => e.status === "APPROVED");
  const drafts = entries.filter((e) => e.status === "DRAFT");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader
        title="Daily Work Entry"
        description="Record completed tasks per worker. Amounts are calculated on the server from the rate in effect on the work date."
      />
      <DatePicker value={date} max={today} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Approved task earnings</div><div className="text-xl font-semibold">{formatPKR(sum(approved.map((e) => e.amount)))}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Drafts waiting ({drafts.length})</div><div className="text-xl font-semibold">{formatPKR(sum(drafts.map((e) => e.amount)))}</div></Card>
        <Card className="flex items-center p-4">{canWrite && <ApproveDayButton date={date} draftCount={drafts.length} />}</Card>
      </div>

      {canWrite && (
        <WorkEntryGrid
          key={date}
          date={date}
          workers={workers.map((w) => ({ id: w.id, code: w.code, name: w.fullName }))}
          tasks={activeTasks.map((t) => ({ id: t.id, code: t.code, name: t.name, pricingMethod: t.pricingMethod, unitLabel: t.unitLabel, rate: t.currentRate }))}
        />
      )}

      <EntryList entries={entries} canWrite={canWrite} />
    </div>
  );
}
