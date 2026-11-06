import { requirePagePermission } from "@/server/authz/require";
import { todayKarachi } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { CreateTaskForm } from "../task-forms";

export const metadata = { title: "Add task" };

export default async function NewTaskPage() {
  await requirePagePermission("task:write");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="Add task" />
      <CreateTaskForm today={todayKarachi()} />
    </div>
  );
}
