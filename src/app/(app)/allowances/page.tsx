import { can, requirePagePermission } from "@/server/authz/require";
import { listWorkers } from "@/server/services/worker.service";
import { getAllowancesForDate } from "@/server/services/allowance.service";
import { resolveDateParam, todayKarachi } from "@/lib/dates";
import { DatePicker } from "@/components/shared/date-picker";
import { PageHeader } from "@/components/shared/page-header";
import { AllowanceGrid } from "./allowance-grid";

export const metadata = { title: "Daily Allowances" };
export const dynamic = "force-dynamic";

export default async function AllowancesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePagePermission("work:read");
  const today = todayKarachi();
  const date = resolveDateParam((await searchParams).date, today);
  const [workers, existing] = await Promise.all([listWorkers({ status: "ACTIVE" }), getAllowancesForDate(date)]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="Daily Allowances"
        description="A discretionary extra amount per worker per day (for example machine breakdown). It can be zero, is never automatic, and is kept separate from task earnings."
      />
      <DatePicker value={date} max={today} />
      <AllowanceGrid
        key={date}
        date={date}
        canWrite={can(user, "allowance:write")}
        workers={workers.map((w) => ({ id: w.id, code: w.code, name: w.fullName }))}
        existing={existing}
      />
    </div>
  );
}
