import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilter = { action?: string; entityType?: string; from?: string; to?: string; page?: number };

export async function listAuditLogs(f: AuditFilter) {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.action) where.action = { contains: f.action, mode: "insensitive" };
  if (f.entityType) where.entityType = f.entityType;
  // Pakistan calendar days (UTC+5, no daylight saving)
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00+05:00`) } : {}),
      ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00+05:00`).getTime() + 86_400_000) } : {}),
    };
  }
  const page = Math.max(1, f.page ?? 1);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE,
      include: { user: { select: { fullName: true, username: true } } },
    }),
  ]);
  return {
    total, page, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    rows: rows.map((r) => ({
      id: r.id, time: r.createdAt.toISOString(), user: r.user ? r.user.fullName : "(system / not signed in)", action: r.action,
      entityType: r.entityType, entityId: r.entityId,
      details: JSON.stringify({ before: r.before, after: r.after, meta: r.meta }, null, 2),
      hasDetails: r.before !== null || r.after !== null || r.meta !== null,
    })),
  };
}

export const listAuditEntityTypes = async () =>
  (await prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, where: { entityType: { not: null } }, orderBy: { entityType: "asc" } }))
    .map((r) => r.entityType!);
