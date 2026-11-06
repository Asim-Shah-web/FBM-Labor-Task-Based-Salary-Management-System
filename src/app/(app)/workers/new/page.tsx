import { requirePagePermission } from "@/server/authz/require";
import { listDepartments } from "@/server/services/worker.service";
import { todayKarachi } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { WorkerForm } from "../worker-form";

export const metadata = { title: "Add worker" };

export default async function NewWorkerPage() {
  await requirePagePermission("worker:write");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="Add worker" />
      <WorkerForm mode="create" departments={await listDepartments()} today={todayKarachi()} />
    </div>
  );
}
