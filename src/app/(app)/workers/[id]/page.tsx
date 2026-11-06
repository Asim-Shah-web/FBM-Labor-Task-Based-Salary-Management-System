import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { can, requirePagePermission } from "@/server/authz/require";
import { getWorker, getWorkerProfileData } from "@/server/services/worker.service";
import { formatPKR } from "@/server/money/decimal";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkerStatusButton } from "./status-button";

export const dynamic = "force-dynamic";

function Stat({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-xl font-semibold">{value}</div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-4 text-sm text-muted-foreground">{text}</p>;
}

export default async function WorkerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("worker:read");
  const { id } = await params;
  const worker = await getWorker(id);
  if (!worker) notFound();
  const data = await getWorkerProfileData(id);
  const c = data.attendanceCounts;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <PageHeader
        title={worker.fullName}
        description={`${worker.code}${worker.department ? ` · ${worker.department}` : ""}${worker.jobRole ? ` · ${worker.jobRole}` : ""}`}
        actions={can(user, "worker:write") && (
          <>
            <Button asChild variant="outline"><Link href={`/workers/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link></Button>
            <WorkerStatusButton workerId={id} status={worker.status} />
          </>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Total earned" value={formatPKR(data.totals.earned)} note="Approved task earnings + allowances" />
        <Stat title="Settled (paid + recovered)" value={formatPKR(data.totals.settled)} note="Salary payments arrive in Phase 4" />
        <Stat title="Outstanding earned wages" value={formatPKR(data.totals.outstanding)} />
        <Stat title="Unrecovered advance" value={formatPKR(data.totals.advanceUnrecovered)} note="Advances arrive in Phase 4" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={worker.status} /></dd>
              <dt className="text-muted-foreground">Phone</dt><dd>{worker.phone ?? "-"}</dd>
              <dt className="text-muted-foreground">Joined</dt><dd>{formatDate(worker.joiningDate)}</dd>
              <dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{worker.notes ?? "-"}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Attendance (all time)</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span>Present: <b>{c.PRESENT ?? 0}</b></span>
              <span>Absent: <b>{c.ABSENT ?? 0}</b></span>
              <span>Leave: <b>{c.LEAVE ?? 0}</b></span>
            </div>
            {data.attendance.length === 0 ? <Empty text="No attendance recorded yet." /> : (
              <div className="flex flex-wrap gap-2">
                {data.attendance.slice(0, 30).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                    <span>{formatDate(a.date)}</span><StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Production history (latest 100)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          {data.entries.length === 0 ? <Empty text="No work entries yet." /> : (
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/50 text-left"><tr>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Task</th><th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th>
              </tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className={`border-b last:border-0 ${e.status === "VOIDED" ? "text-muted-foreground line-through" : ""}`}>
                    <td className="px-4 py-2">{formatDate(e.workDate)}</td><td className="px-4 py-2">{e.task}</td>
                    <td className="px-4 py-2 text-right">{e.quantity}{e.unit ? ` ${e.unit}` : ""}</td>
                    <td className="px-4 py-2 text-right">{formatPKR(e.rate)}</td><td className="px-4 py-2 text-right">{formatPKR(e.amount)}</td>
                    <td className="px-4 py-2 no-underline"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daily allowances (latest 60)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-0">
          {data.allowances.length === 0 ? <Empty text="No allowances yet." /> : (
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/50 text-left"><tr>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">Status</th>
              </tr></thead>
              <tbody>
                {data.allowances.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{formatDate(a.workDate)}</td><td className="px-4 py-2 text-right">{formatPKR(a.amount)}</td>
                    <td className="px-4 py-2">{a.reason ?? "-"}</td><td className="px-4 py-2"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
