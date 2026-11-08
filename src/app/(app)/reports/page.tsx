import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { requirePagePermission } from "@/server/authz/require";
import { REPORTS } from "@/lib/reports/definitions";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requirePagePermission("report:read");
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageHeader title="Reports" description="View, print, or export to Excel and PDF." />
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.type} href={`/reports/${r.type}`}>
            <Card className="flex h-full gap-3 p-4 hover:border-primary/50">
              <FileBarChart className="mt-1 h-6 w-6 shrink-0 text-primary" />
              <div><div className="font-medium">{r.title}</div><p className="text-sm text-muted-foreground">{r.description}</p></div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
