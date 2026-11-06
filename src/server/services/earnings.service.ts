// The earnings ledger. This file is the ONLY place that creates or reverses Earning rows.
// An approved work entry / allowance with amount > 0 produces exactly one earning
// (enforced by the unique workEntryId / allowanceId columns). Earnings are never edited or
// deleted: a correction reverses the old earning and creates a new one from a replacement entry.
import type { Prisma } from "@prisma/client";
import { DomainError } from "@/server/errors";

type Tx = Prisma.TransactionClient;
type Source = { id: string; workerId: string; workDate: Date; amount: Prisma.Decimal };

export async function createEarningForEntry(tx: Tx, entry: Source) {
  if (entry.amount.lte(0)) return null;
  return tx.earning.create({
    data: { workerId: entry.workerId, workDate: entry.workDate, sourceType: "TASK_ENTRY", workEntryId: entry.id, amount: entry.amount },
  });
}

export async function createEarningForAllowance(tx: Tx, allowance: Source) {
  if (allowance.amount.lte(0)) return null;
  return tx.earning.create({
    data: { workerId: allowance.workerId, workDate: allowance.workDate, sourceType: "DAILY_ALLOWANCE", allowanceId: allowance.id, amount: allowance.amount },
  });
}

const SETTLED_MESSAGE =
  "Part of this amount has already been paid or recovered. Reverse that salary settlement first, then correct the record.";

async function reverseWhere(tx: Tx, where: { workEntryId: string } | { allowanceId: string }, reason: string) {
  // Lock the row so a concurrent settlement cannot slip in between the check and the update.
  if ("workEntryId" in where)
    await tx.$queryRaw`SELECT id FROM "earnings" WHERE "workEntryId" = ${where.workEntryId} FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM "earnings" WHERE "allowanceId" = ${where.allowanceId} FOR UPDATE`;

  const earning = await tx.earning.findUnique({ where });
  if (!earning || earning.status === "REVERSED") return null; // zero-amount source or already reversed
  if (earning.settledAmount.gt(0)) throw new DomainError("SETTLED_EARNING", SETTLED_MESSAGE);
  return tx.earning.update({
    where: { id: earning.id },
    data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason },
  });
}

export const reverseEarningForEntry = (tx: Tx, workEntryId: string, reason: string) =>
  reverseWhere(tx, { workEntryId }, reason);

export const reverseEarningForAllowance = (tx: Tx, allowanceId: string, reason: string) =>
  reverseWhere(tx, { allowanceId }, reason);
