import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { money, type Money } from "@/server/money/decimal";
import type { ChangeRateInput } from "@/lib/validators/task";
import { changeRateSchema } from "@/lib/validators/task";
import { audit } from "./audit.service";
import type { Actor } from "@/server/guards";

type Db = Prisma.TransactionClient | typeof prisma;

/** The rate in force for `taskId` on `workDate`. Throws if the task had no rate yet. */
export async function resolveRate(db: Db, taskId: string, workDate: string): Promise<{ id: string; rate: Money }> {
  const row = await db.taskRateHistory.findFirst({
    where: { taskId, effectiveFrom: { lte: toDbDate(workDate) } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!row) throw new DomainError("NO_RATE", `This task has no rate in effect on ${workDate}. Add a rate that starts on or before that date.`);
  return { id: row.id, rate: money(row.rate.toString()) };
}

/**
 * Append a new effective-dated rate. Existing work entries are NOT touched: each entry keeps
 * the rate that was applied when it was recorded.
 */
export async function changeRate(actor: Actor, taskId: string, input: ChangeRateInput) {
  const data = changeRateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) throw new DomainError("NOT_FOUND", "Task not found.");

    const same = await tx.taskRateHistory.findUnique({
      where: { taskId_effectiveFrom: { taskId, effectiveFrom: toDbDate(data.effectiveFrom) } },
    });
    if (same) throw new DomainError("RATE_EXISTS", `A rate effective ${data.effectiveFrom} already exists for this task. Choose a different date.`);

    const previous = await tx.taskRateHistory.findFirst({
      where: { taskId, effectiveFrom: { lte: toDbDate(data.effectiveFrom) } },
      orderBy: { effectiveFrom: "desc" },
    });

    const created = await tx.taskRateHistory.create({
      data: { taskId, rate: data.rate, effectiveFrom: toDbDate(data.effectiveFrom), reason: data.reason, createdById: actor.id },
    });
    await audit(
      {
        userId: actor.id,
        action: "rate.change",
        entityType: "Task",
        entityId: taskId,
        before: previous ? { rate: previous.rate.toString(), effectiveFrom: fromDbDate(previous.effectiveFrom) } : undefined,
        after: { rate: created.rate.toString(), effectiveFrom: data.effectiveFrom, reason: data.reason ?? null },
      },
      tx,
    );
    return created;
  });
}
