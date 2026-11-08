import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/** Liveness/readiness for uptime monitors and Docker. Public on purpose; reveals nothing sensitive. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "database_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
