import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditInput = {
  userId?: string | null;
  action: string; // e.g. "auth.login", "settlement.post"
  entityType?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  meta?: Prisma.InputJsonValue;
};

/**
 * Pass the active transaction client as `db` when auditing a data change, so the change
 * and its audit row commit or roll back together.
 */
export async function audit(input: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      meta: input.meta,
    },
  });
}
