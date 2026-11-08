import { formatCell, isNumeric } from "@/lib/reports/format";
import { formatDate } from "@/lib/dates";
import type { Report } from "@/lib/reports/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Renders any Report. Used on screen and for printing (the app shell is hidden in print). */
export function ReportView({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-4 print:gap-3">
      <div>
        <h2 className="text-lg font-semibold">{report.title}</h2>
        {report.subtitle && <p className="text-sm">{report.subtitle}</p>}
        <p className="text-xs text-muted-foreground">Generated {formatDate(report.generatedAt)}. Amounts in PKR.</p>
        {report.filters.length > 0 && <p className="text-xs text-muted-foreground">{report.filters.join("  |  ")}</p>}
      </div>

      {report.summary && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
          {report.summary.map((s) => (
            <Card key={s.label} className="p-3 print:shadow-none">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold tabular-nums">{formatCell({ key: "v", label: "", type: s.type }, s.value)}</div>
            </Card>
          ))}
        </div>
      )}

      {report.sections.map((sec, i) => (
        <div key={i} className="flex flex-col gap-2 print:break-inside-avoid-page">
          {sec.heading && <h3 className="text-sm font-semibold">{sec.heading}</h3>}
          <Card className="overflow-x-auto print:shadow-none">
            <table className="w-full min-w-max text-sm print:text-xs">
              <thead className="border-b bg-muted/50 text-left">
                <tr>{sec.columns.map((c) => <th key={c.key} className={cn("px-3 py-2 font-medium", isNumeric(c.type) && "text-right")}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {sec.rows.length === 0 ? (
                  <tr><td colSpan={sec.columns.length} className="px-3 py-4 text-center text-muted-foreground">{sec.emptyText ?? "No data."}</td></tr>
                ) : sec.rows.map((row, r) => (
                  <tr key={r} className="border-b last:border-0">
                    {sec.columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2", isNumeric(c.type) && "text-right tabular-nums")}>
                        {c.type === "status" && row[c.key] ? <StatusBadge status={row[c.key]!} /> : formatCell(c, row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {sec.totals && sec.rows.length > 0 && (
                <tfoot className="border-t bg-muted/50 font-medium">
                  <tr>{sec.columns.map((c) => <td key={c.key} className={cn("px-3 py-2", isNumeric(c.type) && "text-right tabular-nums")}>{formatCell(c, sec.totals![c.key])}</td>)}</tr>
                </tfoot>
              )}
            </table>
          </Card>
        </div>
      ))}

      {report.notes && report.notes.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
    </div>
  );
}
