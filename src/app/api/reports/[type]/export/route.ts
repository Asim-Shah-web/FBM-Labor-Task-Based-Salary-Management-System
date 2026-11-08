import { can } from "@/server/authz/require";
import { getCurrentUser } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { isReportType } from "@/lib/reports/definitions";
import { parseParams } from "@/lib/reports/period";
import { buildReport } from "@/server/services/report.service";
import { reportToXlsx } from "@/server/reports/excel";
import { reportToPdf } from "@/server/reports/pdf";
import { audit } from "@/server/services/audit.service";
import { todayKarachi } from "@/lib/dates";
import { rateLimit } from "@/server/auth/rate-limit";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  // Authorization is checked here on the server (middleware alone is not enough).
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (!can(user, "report:export")) return new Response("You do not have permission to export reports.", { status: 403 });

  // Exports are heavy: limit each user to 30 per minute.
  if (!rateLimit(`export:${user.id}`, 30, 60_000)) return new Response("Too many exports. Please wait a minute.", { status: 429 });

  const { type } = await params;
  if (!isReportType(type)) return new Response("Unknown report.", { status: 404 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") return new Response("Format must be xlsx or pdf.", { status: 400 });

  try {
    const query = parseParams(Object.fromEntries(url.searchParams.entries()));
    const report = await buildReport(type, query);
    const body = format === "xlsx" ? await reportToXlsx(report) : await reportToPdf(report);
    await audit({ userId: user.id, action: "report.export", entityType: "Report", entityId: type, meta: { format, ...query } });

    const filename = `fbm-${type}-${todayKarachi()}.${format}`;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 400 });
    logger.error("Report export failed", e, { type, format });
    return new Response("Could not generate the report.", { status: 500 });
  }
}
