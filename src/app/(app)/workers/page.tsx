import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { can, requirePagePermission } from "@/server/authz/require";
import { listDepartments, listWorkers } from "@/server/services/worker.service";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { WorkersTable } from "./workers-table";

export const metadata = { title: "Workers" };
export const dynamic = "force-dynamic";

export default async function WorkersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; department?: string }> }) {
  const user = await requirePagePermission("worker:read");
  const sp = await searchParams;
  const status = sp.status === "ACTIVE" || sp.status === "INACTIVE" ? sp.status : undefined;
  const [workers, departments] = await Promise.all([
    listWorkers({ q: sp.q, status, department: sp.department || undefined }),
    listDepartments(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader
        title="Workers"
        description={`${workers.length} worker${workers.length === 1 ? "" : "s"} shown`}
        actions={can(user, "worker:write") && (
          <Button asChild><Link href="/workers/new"><Plus className="h-4 w-4" /> Add worker</Link></Button>
        )}
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form className="grid gap-3 sm:grid-cols-[1fr_10rem_12rem_auto]" method="get">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, code or phone" aria-label="Search workers" />
            <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Status">
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </NativeSelect>
            <NativeSelect name="department" defaultValue={sp.department ?? ""} aria-label="Department">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </NativeSelect>
            <Button type="submit" variant="outline"><Search className="h-4 w-4" /> Filter</Button>
          </form>
        </CardContent>
      </Card>

      <WorkersTable rows={workers} />
    </div>
  );
}
