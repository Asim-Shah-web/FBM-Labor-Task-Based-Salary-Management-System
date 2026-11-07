// Salary settlements: the most sensitive code in the system.
//
// post():    cash + optional advance recovery -> applied to the OLDEST unpaid earnings in the
//            manager-selected period. One transaction, row locks, idempotency key, DB CHECKs as safety net.
// reverse(): undoes a whole settlement (rows kept, status REVERSED), restoring balances.
//
// Lock order is always: worker row -> earning rows -> advance rows -> (receipt-number advisory lock).
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate, todayKarachi } from "@/lib/dates";
import { settlementSchema, type SettlementInput } from "@/lib/validators/finance";
import { reasonSchema } from "@/lib/validators/daily";
import { formatPKR, money, sum } from "@/server/money/decimal";
import type { Actor } from "@/server/guards";
import { audit } from "./audit.service";
import { allocateOldestFirst, pairRecoveries } from "./allocation.engine";

type Tx = Prisma.TransactionClient;
const dec = (v: unknown) => money(String(v));
const D = (m: { toFixed(n: number): string }) => new Prisma.Decimal(m.toFixed(2));

type LockedEarning = { id: string; workDate: Date; createdAt: Date; amount: unknown; settledAmount: unknown };
type LockedAdvance = { id: string; amount: unknown; recoveredAmount: unknown };

async function nextReceiptNo(tx: Tx): Promise<string> {
  // Global advisory lock (held until commit) so two settlements can never take the same number.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(748201)`;
  const year = todayKarachi().slice(0, 4);
  const last = await tx.salaryPayment.findFirst({
    where: { receiptNo: { startsWith: `SP-${year}-` } },
    orderBy: { receiptNo: "desc" },
    select: { receiptNo: true },
  });
  const n = last ? Number(last.receiptNo.split("-")[2]) + 1 : 1;
  return `SP-${year}-${String(n).padStart(6, "0")}`;
}

export async function postSettlement(actor: Actor, input: SettlementInput) {
  const data = settlementSchema.parse(input);
  const today = todayKarachi();
  if (data.paymentDate > today) throw new DomainError("FUTURE_DATE", "The payment date cannot be in the future.");
  if (data.periodEnd > today) throw new DomainError("FUTURE_DATE", "The work period cannot extend into the future.");

  const cash = money(data.cashAmount);
  const recovery = money(data.advanceRecoveryAmount);
  const total = cash.plus(recovery);
  if (total.lte(0)) throw new DomainError("ZERO_PAYMENT", "Enter a cash amount, an advance recovery, or both.");

  return prisma.$transaction(
    async (tx) => {
      // 1. Serialise all settlements for this worker.
      const worker = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "workers" WHERE id = ${data.workerId} FOR UPDATE`;
      if (worker.length === 0) throw new DomainError("NOT_FOUND", "Worker not found.");

      // 2. Idempotency (checked AFTER the lock so a concurrent duplicate sees the first commit).
      const dup = await tx.salaryPayment.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (dup) {
        if (dup.workerId !== data.workerId) throw new DomainError("KEY_REUSED", "This request key was already used.");
        return { id: dup.id, receiptNo: dup.receiptNo, duplicate: true };
      }

      // 3. Lock the eligible earnings (oldest first) and compute the fresh outstanding.
      const rows = await tx.$queryRaw<LockedEarning[]>`
        SELECT id, "workDate", "createdAt", amount, "settledAmount"
        FROM "earnings"
        WHERE "workerId" = ${data.workerId}
          AND status = 'ACTIVE'
          AND "workDate" BETWEEN CAST(${data.periodStart} AS date) AND CAST(${data.periodEnd} AS date)
          AND amount > "settledAmount"
        ORDER BY "workDate", "createdAt", id
        FOR UPDATE`;
      const earnings = rows.map((r) => ({
        id: r.id,
        workDate: fromDbDate(new Date(r.workDate)),
        createdAt: new Date(r.createdAt).toISOString(),
        outstanding: dec(r.amount).minus(dec(r.settledAmount)),
      }));
      const outstanding = sum(earnings.map((e) => e.outstanding));
      if (total.gt(outstanding))
        throw new DomainError(
          "EXCEEDS_OUTSTANDING",
          `The amount (${formatPKR(total)}) is more than the outstanding wages for this period (${formatPKR(outstanding)}). Nothing was saved.`,
        );

      // 4. Advances (only when recovering).
      let advances: { id: string; outstanding: ReturnType<typeof money> }[] = [];
      if (recovery.gt(0)) {
        const adv = await tx.$queryRaw<LockedAdvance[]>`
          SELECT id, amount, "recoveredAmount"
          FROM "advances"
          WHERE "workerId" = ${data.workerId} AND status = 'ACTIVE' AND amount > "recoveredAmount"
          ORDER BY "advanceDate", "createdAt", id
          FOR UPDATE`;
        advances = adv.map((a) => ({ id: a.id, outstanding: dec(a.amount).minus(dec(a.recoveredAmount)) }));
        const advTotal = sum(advances.map((a) => a.outstanding));
        if (recovery.gt(advTotal))
          throw new DomainError("EXCEEDS_ADVANCE_BALANCE", `Recovery (${formatPKR(recovery)}) is more than the worker's unrecovered advance (${formatPKR(advTotal)}).`);
      }

      // 5. Pure allocation, then write everything.
      const lines = allocateOldestFirst(earnings, cash, recovery);
      const recoveryPairs = pairRecoveries(advances, lines.filter((l) => l.recovery.gt(0)).map((l) => ({ earningId: l.earningId, amount: l.recovery })));

      const receiptNo = await nextReceiptNo(tx);
      const payment = await tx.salaryPayment.create({
        data: {
          receiptNo,
          idempotencyKey: data.idempotencyKey,
          workerId: data.workerId,
          paymentDate: toDbDate(data.paymentDate),
          periodStart: toDbDate(data.periodStart),
          periodEnd: toDbDate(data.periodEnd),
          cashAmount: D(cash),
          advanceRecoveryAmount: D(recovery),
          totalSettled: D(total),
          notes: data.notes,
          recordedById: actor.id,
        },
      });

      for (const l of lines) {
        if (l.cash.gt(0))
          await tx.paymentAllocation.create({ data: { paymentId: payment.id, earningId: l.earningId, amount: D(l.cash) } });
        await tx.earning.update({ where: { id: l.earningId }, data: { settledAmount: { increment: D(l.cash.plus(l.recovery)) } } });
      }

      const perAdvance = new Map<string, ReturnType<typeof money>>();
      for (const p of recoveryPairs) {
        await tx.advanceRecovery.create({ data: { advanceId: p.advanceId, earningId: p.earningId, paymentId: payment.id, amount: D(p.amount) } });
        perAdvance.set(p.advanceId, (perAdvance.get(p.advanceId) ?? money(0)).plus(p.amount));
      }
      for (const [advanceId, amt] of perAdvance)
        await tx.advance.update({ where: { id: advanceId }, data: { recoveredAmount: { increment: D(amt) } } });

      await audit(
        {
          userId: actor.id,
          action: "settlement.post",
          entityType: "SalaryPayment",
          entityId: payment.id,
          after: {
            receiptNo, workerId: data.workerId, paymentDate: data.paymentDate, period: [data.periodStart, data.periodEnd],
            cash: cash.toFixed(2), advanceRecovery: recovery.toFixed(2), outstandingBefore: outstanding.toFixed(2),
            allocations: lines.map((l) => ({ date: l.workDate, earningId: l.earningId, cash: l.cash.toFixed(2), recovery: l.recovery.toFixed(2) })),
          },
        },
        tx,
      );
      return { id: payment.id, receiptNo, duplicate: false };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/** Reverses a whole settlement. Rows are kept for history; balances are restored. */
export async function reverseSettlement(actor: Actor, paymentId: string, reasonInput: string) {
  const reason = reasonSchema.parse(reasonInput);

  return prisma.$transaction(
    async (tx) => {
      const head = await tx.salaryPayment.findUnique({ where: { id: paymentId }, select: { workerId: true } });
      if (!head) throw new DomainError("NOT_FOUND", "Payment not found.");

      await tx.$queryRaw`SELECT id FROM "workers" WHERE id = ${head.workerId} FOR UPDATE`;
      const payment = await tx.salaryPayment.findUnique({ where: { id: paymentId }, include: { allocations: true, recoveries: true } });
      if (!payment) throw new DomainError("NOT_FOUND", "Payment not found.");
      if (payment.status === "REVERSED") throw new DomainError("ALREADY_REVERSED", "This payment was already reversed.");

      const perEarning = new Map<string, ReturnType<typeof money>>();
      for (const a of payment.allocations) perEarning.set(a.earningId, (perEarning.get(a.earningId) ?? money(0)).plus(a.amount.toString()));
      for (const r of payment.recoveries) perEarning.set(r.earningId, (perEarning.get(r.earningId) ?? money(0)).plus(r.amount.toString()));
      const perAdvance = new Map<string, ReturnType<typeof money>>();
      for (const r of payment.recoveries) perAdvance.set(r.advanceId, (perAdvance.get(r.advanceId) ?? money(0)).plus(r.amount.toString()));

      const earningIds = [...perEarning.keys()].sort();
      if (earningIds.length) await tx.$queryRaw`SELECT id FROM "earnings" WHERE id IN (${Prisma.join(earningIds)}) ORDER BY id FOR UPDATE`;
      const advanceIds = [...perAdvance.keys()].sort();
      if (advanceIds.length) await tx.$queryRaw`SELECT id FROM "advances" WHERE id IN (${Prisma.join(advanceIds)}) ORDER BY id FOR UPDATE`;

      for (const [id, amt] of perEarning) await tx.earning.update({ where: { id }, data: { settledAmount: { decrement: D(amt) } } });
      for (const [id, amt] of perAdvance) await tx.advance.update({ where: { id }, data: { recoveredAmount: { decrement: D(amt) } } });

      await tx.salaryPayment.update({
        where: { id: paymentId },
        data: { status: "REVERSED", reversedById: actor.id, reversedAt: new Date(), reversalReason: reason },
      });
      await audit(
        {
          userId: actor.id, action: "settlement.reverse", entityType: "SalaryPayment", entityId: paymentId,
          before: { status: "POSTED", receiptNo: payment.receiptNo, cash: payment.cashAmount.toString(), advanceRecovery: payment.advanceRecoveryAmount.toString() },
          after: { status: "REVERSED" }, meta: { reason },
        },
        tx,
      );
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

export type PaymentListRow = {
  id: string; receiptNo: string; workerId: string; workerName: string; workerCode: string; paymentDate: string;
  periodStart: string; periodEnd: string; cash: string; recovery: string; total: string; status: "POSTED" | "REVERSED";
};

export async function listPayments(opts: { workerId?: string; take?: number } = {}): Promise<PaymentListRow[]> {
  const rows = await prisma.salaryPayment.findMany({
    where: opts.workerId ? { workerId: opts.workerId } : undefined,
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 30,
    include: { worker: { select: { fullName: true, code: true } } },
  });
  return rows.map((p) => ({
    id: p.id, receiptNo: p.receiptNo, workerId: p.workerId, workerName: p.worker.fullName, workerCode: p.worker.code,
    paymentDate: fromDbDate(p.paymentDate), periodStart: fromDbDate(p.periodStart), periodEnd: fromDbDate(p.periodEnd),
    cash: p.cashAmount.toString(), recovery: p.advanceRecoveryAmount.toString(), total: p.totalSettled.toString(), status: p.status,
  }));
}

export async function getPayment(id: string) {
  const p = await prisma.salaryPayment.findUnique({
    where: { id },
    include: {
      worker: { select: { id: true, fullName: true, code: true } },
      recordedBy: { select: { fullName: true } },
      reversedBy: { select: { fullName: true } },
      allocations: { include: { earning: { select: { workDate: true, sourceType: true, amount: true } } } },
      recoveries: { include: { earning: { select: { workDate: true, sourceType: true, amount: true } }, advance: { select: { advanceDate: true } } } },
    },
  });
  if (!p) return null;

  const lines = new Map<string, { date: string; source: string; earned: string; cash: ReturnType<typeof money>; recovery: ReturnType<typeof money> }>();
  const line = (earningId: string, e: { workDate: Date; sourceType: string; amount: Prisma.Decimal }) => {
    if (!lines.has(earningId))
      lines.set(earningId, { date: fromDbDate(e.workDate), source: e.sourceType, earned: e.amount.toString(), cash: money(0), recovery: money(0) });
    return lines.get(earningId)!;
  };
  for (const a of p.allocations) { const l = line(a.earningId, a.earning); l.cash = l.cash.plus(a.amount.toString()); }
  for (const r of p.recoveries) { const l = line(r.earningId, r.earning); l.recovery = l.recovery.plus(r.amount.toString()); }

  return {
    id: p.id, receiptNo: p.receiptNo, status: p.status, worker: p.worker,
    paymentDate: fromDbDate(p.paymentDate), periodStart: fromDbDate(p.periodStart), periodEnd: fromDbDate(p.periodEnd),
    cash: p.cashAmount.toString(), recovery: p.advanceRecoveryAmount.toString(), total: p.totalSettled.toString(),
    notes: p.notes, recordedBy: p.recordedBy.fullName, createdAt: p.createdAt.toISOString(),
    reversedBy: p.reversedBy?.fullName ?? null, reversedAt: p.reversedAt?.toISOString() ?? null, reversalReason: p.reversalReason,
    lines: [...lines.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => ({ date: l.date, source: l.source, earned: l.earned, cash: l.cash.toString(), recovery: l.recovery.toString() })),
  };
}
