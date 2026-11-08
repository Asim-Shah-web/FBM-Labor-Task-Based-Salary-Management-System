import Link from "next/link";
import { requirePagePermission } from "@/server/authz/require";
import { AUDIT_PAGE_SIZE, listAuditEntityTypes, listAuditLogs } from "@/server/services/audit-query.service";
import { formatDateTimeKarachi, isValidIsoDate, todayKarachi } from "@/lib/dates";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { IntegrityCheck } from "./integrity-check";

export const metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entityType?: string; from?: string; to?: string; page?: string }> }) {
  await requirePagePermission("audit:read");
  const sp = await searchParams;
  const from = sp.from && isValidIsoDate(sp.from) ? sp.from : undefined;
  const to = sp.to && isValidIsoDate(sp.to) ? sp.to : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, types] = await Promise.all([listAuditLogs({ action: sp.action?.trim() || undefined, entityType: sp.entityType || undefined, from, to, page }), listAuditEntityTypes()]);
  const today = todayKarachi();
  const qs = (p: number) => new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(sp.entityType ? { entityType: sp.entityType } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), page: String(p) }).toString();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
      <PageHeader title="Audit Log" description="A permanent record of who did what and when. It cannot be edited or deleted." />
      <IntegrityCheck />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-2"><Label htmlFor="action">Action contains</Label><Input id="action" name="action" defaultValue={sp.action ?? ""} placeholder="e.g. settlement" /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="entityType">Record type</Label>
              <NativeSelect id="entityType" name="entityType" defaultValue={sp.entityType ?? ""}><option value="">All</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect></div>
            <div className="flex flex-col gap-2"><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={from ?? ""} max={today} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={to ?? ""} max={today} /></div>
            <div className="flex items-end"><Button type="submit">Filter</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b bg-muted/50 text-left"><tr><th className="px-3 py-2">When (PKT)</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">Details</th></tr></thead>
          <tbody>
            {data.rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No audit entries match.</td></tr> : data.rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2">{formatDateTimeKarachi(r.time)}</td>
                <td className="px-3 py-2">{r.user}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 text-xs">{r.entityType ?? "-"}{r.entityId && <div className="font-mono text-muted-foreground">{r.entityId.slice(0, 12)}</div>}</td>
                <td className="px-3 py-2">{r.hasDetails ? <details><summary className="cursor-pointer text-primary">View</summary><pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{r.details}</pre></details> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{data.total} entries, page {data.page} of {data.pages} ({AUDIT_PAGE_SIZE} per page)</span>
        <div className="flex gap-2">
          {data.page > 1 && <Button asChild variant="outline" size="sm"><Link href={`/audit?${qs(data.page - 1)}`}>Previous</Link></Button>}
          {data.page < data.pages && <Button asChild variant="outline" size="sm"><Link href={`/audit?${qs(data.page + 1)}`}>Next</Link></Button>}
        </div>
      </div>
    </div>
  );
}
