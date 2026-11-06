// Daily production entries. Approved entries are immutable: a correction voids the old entry
// (reversing its earning) and creates a replacement that keeps the original applied rate.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { workLinesSchema, reasonSchema } from "@/lib/validators/daily";
import { decimalString } from "@/lib/validators/common";
import { money } from "@/server/money/decimal";
import { assertWorkDateAllowed, type Actor } from "@/server/guards";
import { audit } from "./audit.service";
import { createEarningForEntry, reverseEarningForEntry } from "./earnings.service";
import { entryAmount, validateQuantity } from "./pricing";
import { resolveRate } from "./rates.service";

type Tx = Prisma.TransactionClient;

export type EntryRow = {
  id: string; workerId: string; workerCode: string; workerName: string;
  taskId: string; taskCode: string; taskName: string; unitLabel: string | null; pricingMethod: "PER_UNIT" | "FIXED_PER_TASK";
  quantity: string; appliedRate: string; amount: string; status: "DRAFT" | "APPROVED" | "VOIDED"; voidReason: string | null;
};

export async function listEntriesForDate(date: string): Promise<EntryRow[]> {
  const rows = await prisma.dailyWorkEntry.findMany({
    where: { workDate: toDbDate(date) },
    include: { worker: { select: { code: true, fullName: true } }, task: { select: { code: true, name: true, unitLabel: true } } },
    orderBy: [{ worker: { code: "asc" } }, { createdAt: "asc" }],
  });
  return rows.map((e) => ({
    id: e.id, workerId: e.workerId, workerCode: e.worker.code, workerName: e.worker.fullName,
    taskId: e.taskId, taskCode: e.task.code, taskName: e.task.name, unitLabel: e.task.unitLabel, pricingMethod: e.pricingMethod,
    quantity: e.quantity.toString(), appliedRate: e.appliedRate.toString(), amount: e.amount.toString(),
    status: e.status, voidReason: e.voidReason,
  }));
}

/** Create one or many entries atomically (all lines succeed or none do). */
export async function createEntries(actor: Actor, input: { workDate: string; approve: boolean; lines: { workerId: string; taskId: string; quantity: string }[] }) {
  const data = workLinesSchema.parse(input);
  assertWorkDateAllowed(data.workDate);
  const workDate = toDbDate(data.workDate);

  return prisma.$transaction(async (tx) => {
    const seen = new Set<string>();
    for (const l of data.lines) {
      const key = `${l.workerId}:${l.taskId}`;
      if (seen.has(key)) throw new DomainError("DUPLICATE_LINE", "The same worker and task appear on two lines. Combine them into one line.");
      seen.add(key);
    }
    const workerIds = [...new Set(data.lines.map((l) => l.workerId))];
    const taskIds = [...new Set(data.lines.map((l) => l.taskId))];
    const workers = new Map((await tx.worker.findMany({ where: { id: { in: workerIds } } })).map((w) => [w.id, w]));
    const tasks = new Map((await tx.task.findMany({ where: { id: { in: taskIds } } })).map((t) => [t.id, t]));
    const existing = new Set(
      (await tx.dailyWorkEntry.findMany({
        where: { workDate, workerId: { in: workerIds }, taskId: { in: taskIds }, status: { not: "VOIDED" } },
        select: { workerId: true, taskId: true },
      })).map((e) => `${e.workerId}:${e.taskId}`),
    );

    let total = money(0);
    for (const line of data.lines) {
      const worker = workers.get(line.workerId);
      const task = tasks.get(line.taskId);
      if (!worker || !task) throw new DomainError("NOT_FOUND", "A selected worker or task no longer exists.");
      if (worker.status !== "ACTIVE") throw new DomainError("INACTIVE_WORKER", `${worker.fullName} is inactive. Activate the worker first.`);
      if (!task.isActive) throw new DomainError("INACTIVE_TASK", `Task "${task.name}" is inactive.`);

      const qtyError = validateQuantity(task.pricingMethod, line.quantity);
      if (qtyError) throw new DomainError("INVALID_QUANTITY", `${worker.fullName} / ${task.name}: ${qtyError}`);
      if (existing.has(`${worker.id}:${task.id}`))
        throw new DomainError("DUPLICATE_ENTRY", `${worker.fullName} already has an entry for "${task.name}" on this date. Use "Correct" on the existing entry.`);

      const rate = await resolveRate(tx, task.id, data.workDate);
      const amount = entryAmount(line.quantity, rate.rate);
      const now = new Date();
      const entry = await tx.dailyWorkEntry.create({
        data: {
          workerId: worker.id, workDate, taskId: task.id, pricingMethod: task.pricingMethod,
          quantity: line.quantity, rateHistoryId: rate.id, appliedRate: rate.rate.toFixed(2), amount: amount.toFixed(2),
          status: data.approve ? "APPROVED" : "DRAFT", createdById: actor.id,
          approvedById: data.approve ? actor.id : null, approvedAt: data.approve ? now : null,
        },
      });
      if (data.approve) await createEarningForEntry(tx, entry);
      await audit({
        userId: actor.id, action: data.approve ? "work.create_approved" : "work.create_draft", entityType: "DailyWorkEntry", entityId: entry.id,
        after: { worker: worker.code, task: task.code, workDate: data.workDate, quantity: line.quantity, appliedRate: rate.rate.toFixed(2), amount: amount.toFixed(2) },
      }, tx);
      total = total.plus(amount);
    }
    return { count: data.lines.length, total: total.toFixed(2) };
  });
}

async function approveInTx(tx: Tx, actor: Actor, ids: string[]) {
  const entries = await tx.dailyWorkEntry.findMany({ where: { id: { in: ids } } });
  if (entries.length !== ids.length) throw new DomainError("NOT_FOUND", "An entry no longer exists.");
  for (const e of entries) {
    if (e.status !== "DRAFT") throw new DomainError("NOT_DRAFT", "Only draft entries can be approved.");
    const approved = await tx.dailyWorkEntry.update({ where: { id: e.id }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() } });
    await createEarningForEntry(tx, approved);
    await audit({ userId: actor.id, action: "work.approve", entityType: "DailyWorkEntry", entityId: e.id, after: { amount: approved.amount.toString() } }, tx);
  }
  return entries.length;
}

export const approveEntries = (actor: Actor, ids: string[]) =>
  prisma.$transaction((tx) => approveInTx(tx, actor, ids));

export async function approveDay(actor: Actor, workDate: string) {
  return prisma.$transaction(async (tx) => {
    const drafts = await tx.dailyWorkEntry.findMany({ where: { workDate: toDbDate(workDate), status: "DRAFT" }, select: { id: true } });
    if (drafts.length === 0) return 0;
    return approveInTx(tx, actor, drafts.map((d) => d.id));
  });
}

export async function voidEntry(actor: Actor, id: string, reasonInput: string) {
  const reason = reasonSchema.parse(reasonInput);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.dailyWorkEntry.findUnique({ where: { id } });
    if (!entry) throw new DomainError("NOT_FOUND", "Entry not found.");
    if (entry.status === "VOIDED") throw new DomainError("ALREADY_VOIDED", "This entry is already voided.");
    if (entry.status === "APPROVED") await reverseEarningForEntry(tx, id, `Entry voided: ${reason}`);
    await tx.dailyWorkEntry.update({ where: { id }, data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: reason } });
    await audit({
      userId: actor.id, action: "work.void", entityType: "DailyWorkEntry", entityId: id,
      before: { status: entry.status, quantity: entry.quantity.toString(), amount: entry.amount.toString() }, meta: { reason },
    }, tx);
  });
}

/**
 * Change the quantity of an entry. The ORIGINAL applied rate is kept (the rate was right when the
 * work was recorded). DRAFT: edited in place. APPROVED: void + replacement with a new earning.
 */
export async function correctEntryQuantity(actor: Actor, id: string, quantityInput: string, reasonInput: string) {
  const quantity = decimalString("Quantity", { decimals: 3 }).parse(quantityInput);
  const reason = reasonSchema.parse(reasonInput);

  return prisma.$transaction(async (tx) => {
    const old = await tx.dailyWorkEntry.findUnique({ where: { id }, include: { task: true } });
    if (!old) throw new DomainError("NOT_FOUND", "Entry not found.");
    if (old.status === "VOIDED") throw new DomainError("ALREADY_VOIDED", "A voided entry cannot be corrected.");
    const err = validateQuantity(old.pricingMethod, quantity);
    if (err) throw new DomainError("INVALID_QUANTITY", err);
    if (money(quantity).eq(money(old.quantity.toString()))) throw new DomainError("NO_CHANGE", "The quantity is unchanged.");

    const amount = entryAmount(quantity, old.appliedRate.toString());
    const before = { quantity: old.quantity.toString(), amount: old.amount.toString(), status: old.status };

    if (old.status === "DRAFT") {
      await tx.dailyWorkEntry.update({ where: { id }, data: { quantity, amount: amount.toFixed(2) } });
      await audit({ userId: actor.id, action: "work.correct_draft", entityType: "DailyWorkEntry", entityId: id, before, after: { quantity, amount: amount.toFixed(2) }, meta: { reason } }, tx);
      return;
    }

    await reverseEarningForEntry(tx, id, `Entry corrected: ${reason}`);
    await tx.dailyWorkEntry.update({ where: { id }, data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: `Corrected: ${reason}` } });
    const replacement = await tx.dailyWorkEntry.create({
      data: {
        workerId: old.workerId, workDate: old.workDate, taskId: old.taskId, pricingMethod: old.pricingMethod,
        quantity, rateHistoryId: old.rateHistoryId, appliedRate: old.appliedRate, amount: amount.toFixed(2),
        status: "APPROVED", createdById: actor.id, approvedById: actor.id, approvedAt: new Date(), replacesEntryId: old.id,
      },
    });
    await createEarningForEntry(tx, replacement);
    await audit({
      userId: actor.id, action: "work.correct", entityType: "DailyWorkEntry", entityId: replacement.id,
      before, after: { quantity, amount: amount.toFixed(2), replaces: old.id, workDate: fromDbDate(old.workDate) }, meta: { reason },
    }, tx);
  });
}
