import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { createTaskSchema, updateTaskSchema, type CreateTaskInput, type UpdateTaskInput } from "@/lib/validators/task";
import type { Actor } from "@/server/guards";
import { audit } from "./audit.service";
import { pickRate } from "./pricing";

export type TaskRow = {
  id: string; code: string; name: string; pricingMethod: "PER_UNIT" | "FIXED_PER_TASK";
  unitLabel: string | null; isActive: boolean; currentRate: string | null; currentSince: string | null;
};

export async function listTasks(today: string): Promise<TaskRow[]> {
  const tasks = await prisma.task.findMany({ include: { rates: true }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return tasks.map((t) => {
    const cur = pickRate(t.rates.map((r) => ({ rate: r.rate.toString(), effectiveFrom: fromDbDate(r.effectiveFrom) })), today);
    return {
      id: t.id, code: t.code, name: t.name, pricingMethod: t.pricingMethod, unitLabel: t.unitLabel,
      isActive: t.isActive, currentRate: cur?.rate ?? null, currentSince: cur?.effectiveFrom ?? null,
    };
  });
}

export async function getTaskDetail(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { rates: { orderBy: { effectiveFrom: "desc" }, include: { createdBy: { select: { fullName: true } } } } },
  });
  if (!task) return null;
  const entryCount = await prisma.dailyWorkEntry.count({ where: { taskId: id, status: { not: "VOIDED" } } });
  return {
    id: task.id, code: task.code, name: task.name, pricingMethod: task.pricingMethod, unitLabel: task.unitLabel,
    isActive: task.isActive, entryCount,
    rates: task.rates.map((r) => ({
      id: r.id, rate: r.rate.toString(), effectiveFrom: fromDbDate(r.effectiveFrom), reason: r.reason,
      createdBy: r.createdBy.fullName, createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function createTask(actor: Actor, input: CreateTaskInput) {
  const data = createTaskSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (await tx.task.findUnique({ where: { code: data.code } }))
      throw new DomainError("TASK_CODE_EXISTS", `Task code ${data.code} is already used.`);
    const task = await tx.task.create({
      data: {
        code: data.code, name: data.name, pricingMethod: data.pricingMethod, unitLabel: data.unitLabel,
        rates: { create: { rate: data.rate, effectiveFrom: toDbDate(data.effectiveFrom), reason: "Initial rate", createdById: actor.id } },
      },
    });
    await audit(
      { userId: actor.id, action: "task.create", entityType: "Task", entityId: task.id,
        after: { code: task.code, name: task.name, pricingMethod: task.pricingMethod, rate: data.rate, effectiveFrom: data.effectiveFrom } },
      tx,
    );
    return task;
  });
}

/** Name and unit label only. The pricing method is fixed once a task exists. */
export async function updateTask(actor: Actor, id: string, input: UpdateTaskInput) {
  const data = updateTaskSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.task.findUnique({ where: { id } });
    if (!before) throw new DomainError("NOT_FOUND", "Task not found.");
    const after = await tx.task.update({ where: { id }, data: { name: data.name, unitLabel: data.unitLabel ?? null } });
    await audit(
      { userId: actor.id, action: "task.update", entityType: "Task", entityId: id,
        before: { name: before.name, unitLabel: before.unitLabel }, after: { name: after.name, unitLabel: after.unitLabel } },
      tx,
    );
  });
}

export async function setTaskActive(actor: Actor, id: string, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.task.update({ where: { id }, data: { isActive } });
    await audit({ userId: actor.id, action: isActive ? "task.activate" : "task.deactivate", entityType: "Task", entityId: t.id }, tx);
  });
}
