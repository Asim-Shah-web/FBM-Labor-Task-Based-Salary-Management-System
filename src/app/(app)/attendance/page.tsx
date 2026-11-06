import { can, requirePagePermission } from "@/server/authz/require";
import { listWorkers } from "@/server/services/worker.service";
import { getAttendanceForDate } from "@/server/services/attendance.service";
import { resolveDateParam, todayKarachi } from "@/lib/dates";
import { DatePicker } from "@/components/shared/date-picker";
import { PageHeader } from "@/components/shared/page-header";
import { AttendanceGrid } from "./attendance-grid";

export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePagePermission("attendance:read");
  const today = todayKarachi();
  const date = resolveDateParam((await searchParams).date, today);
  const [workers, marks] = await Promise.all([listWorkers({ status: "ACTIVE" }), getAttendanceForDate(date)]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title="Attendance" description="One status per worker per day. Attendance never creates wages." />
      <DatePicker value={date} max={today} />
      <AttendanceGrid
        key={date}
        date={date}
        canWrite={can(user, "attendance:write")}
        workers={workers.map((w) => ({ id: w.id, code: w.code, name: w.fullName, department: w.department }))}
        initial={marks}
      />
    </div>
  );
}
