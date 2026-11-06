import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/authz/require";
import { getWorker, listDepartments } from "@/server/services/worker.service";
import { todayKarachi } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { WorkerForm } from "../../worker-form";

export const metadata = { title: "Edit worker" };

export default async function EditWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("worker:write");
  const { id } = await params;
  const w = await getWorker(id);
  if (!w) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={`Edit ${w.fullName}`} description={`Code ${w.code} (cannot be changed)`} />
      <WorkerForm
        mode="edit" workerId={w.id} departments={await listDepartments()} today={todayKarachi()}
        defaults={{ fullName: w.fullName, phone: w.phone ?? "", department: w.department ?? "", jobRole: w.jobRole ?? "", joiningDate: w.joiningDate, notes: w.notes ?? "" }}
      />
    </div>
  );
}
