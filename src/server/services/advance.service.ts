// Advances are cash paid BEFORE wages are earned. They are never wages and never create earnings.
// They are reduced only by explicit recoveries made inside a salary settlement.
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate, todayKarachi } from "@/lib/dates";
import { advanceSchema, type AdvanceInput } from "@/lib/validators/finance";
import { reasonSchema } from "@/lib/validators/daily";
import { money } from "@/server/money/decimal";
import type { Actor } from "@/server/guards";
import { audit } from "./audit.service";

export type AdvanceRow = {
  id: string; workerId: string; workerName: string; workerCode: string; advanceDate: string;
  amount: string; recovered: string; outstanding: string; notes: string | null; status: "ACTIVE" | "VOIDED"; voidReason: string | null;
};

export async function issueAdvance(actor: Actor, input: AdvanceInput) {
  const data = advanceSchema.parse(input);
  if (data.advanceDate > todayKarachi()) throw new DomainError("FUTURE_DATE", "The advance date cannot be in the future.");

  return prisma.$transaction(async (tx) => {
    const worker = await tx.worker.findUnique({ where: { id: data.workerId } });
    if (!worker) throw new DomainError("NOT_FOUND", "Worker not found.");
    if (worker.status !== "ACTIVE") throw new DomainError("INACTIVE_WORKER", `${worker.fullName} is inactive.`);
    const a = await tx.advance.create({
      data: { workerId: data.workerId, advanceDate: toDbDate(data.advanceDate), amount: data.amount, notes: data.notes, issuedById: actor.id },
    });
    await audit({ userId: actor.id, action: "advance.issue", entityType: "Advance", entityId: a.id, after: { worker: worker.code, amount: data.amount, date: data.advanceDate } }, tx);
    return a;
  });
}

/** An advance can be voided only while nothing has been recovered from it. */
export async function voidAdvance(actor: Actor, id: string, reasonInput: string) {
  const reason = reasonSchema.parse(reasonInput);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "advances" WHERE id = ${id} FOR UPDATE`;
    const a = await tx.advance.findUnique({ where: { id } });
    if (!a) throw new DomainError("NOT_FOUND", "Advance not found.");
    if (a.status === "VOIDED") throw new DomainError("ALREADY_VOIDED", "This advance is already voided.");
    if (a.recoveredAmount.gt(0)) throw new DomainError("HAS_RECOVERIES", "Part of this advance has already been recovered. Reverse those salary settlements first.");
    await tx.advance.update({ where: { id }, data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: reason } });
    await audit({ userId: actor.id, action: "advance.void", entityType: "Advance", entityId: id, before: { amount: a.amount.toString() }, meta: { reason } }, tx);
  });
}

export async function listAdvances(opts: { workerId?: string; take?: number } = {}): Promise<AdvanceRow[]> {
  const rows = await prisma.advance.findMany({
    where: opts.workerId ? { workerId: opts.workerId } : undefined,
    orderBy: [{ advanceDate: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 100,
    include: { worker: { select: { fullName: true, code: true } } },
  });
  return rows.map((a) => ({
    id: a.id, workerId: a.workerId, workerName: a.worker.fullName, workerCode: a.worker.code, advanceDate: fromDbDate(a.advanceDate),
    amount: a.amount.toString(), recovered: a.recoveredAmount.toString(),
    outstanding: money(a.amount.toString()).minus(a.recoveredAmount.toString()).toString(),
    notes: a.notes, status: a.status, voidReason: a.voidReason,
  }));
}

export async function advanceTotals(workerId?: string) {
  const r = await prisma.advance.aggregate({
    where: { status: "ACTIVE", ...(workerId ? { workerId } : {}) },
    _sum: { amount: true, recoveredAmount: true },
  });
  const issued = money(r._sum.amount?.toString() ?? "0");
  const recovered = money(r._sum.recoveredAmount?.toString() ?? "0");
  return { issued: issued.toString(), recovered: recovered.toString(), unrecovered: issued.minus(recovered).toString() };
}
