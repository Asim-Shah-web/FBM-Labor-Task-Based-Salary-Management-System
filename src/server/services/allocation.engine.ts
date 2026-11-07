// PURE allocation logic for salary settlements (no database, no side effects).
// This is the heart of the "oldest unpaid work first" rule, so it is small and heavily tested.
import type Decimal from "decimal.js";
import { DomainError } from "@/server/errors";
import { minMoney, money, sum, ZERO, type Money } from "@/server/money/decimal";

export type EarningRow = {
  id: string;
  workDate: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp, tie-breaker within the same date
  outstanding: Decimal.Value; // amount - settledAmount, must be > 0
};

export type AllocationLine = { earningId: string; workDate: string; cash: Money; recovery: Money };

const byOldest = (a: EarningRow, b: EarningRow) =>
  a.workDate.localeCompare(b.workDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Applies `cash` + `recovery` to the oldest outstanding earnings first.
 * Within each earning the advance-recovery portion is applied before cash.
 * Throws if the total exceeds what is outstanding (never silently over-settles).
 */
export function allocateOldestFirst(earnings: EarningRow[], cash: Decimal.Value, recovery: Decimal.Value): AllocationLine[] {
  let remCash = money(cash);
  let remRecovery = money(recovery);
  if (remCash.isNegative() || remRecovery.isNegative()) throw new DomainError("NEGATIVE_AMOUNT", "Amounts cannot be negative.");

  const lines: AllocationLine[] = [];
  for (const e of [...earnings].sort(byOldest)) {
    if (remCash.plus(remRecovery).lte(0)) break;
    const outstanding = money(e.outstanding);
    if (outstanding.lte(0)) continue;

    const take = minMoney(outstanding, remRecovery.plus(remCash));
    const recoveryPart = minMoney(take, remRecovery);
    const cashPart = take.minus(recoveryPart);
    lines.push({ earningId: e.id, workDate: e.workDate, cash: cashPart, recovery: recoveryPart });
    remRecovery = remRecovery.minus(recoveryPart);
    remCash = remCash.minus(cashPart);
  }

  if (remCash.plus(remRecovery).gt(0))
    throw new DomainError("EXCEEDS_OUTSTANDING", "The amount is more than the outstanding wages in the selected period.");

  // Invariants: nothing created or lost.
  if (!sum(lines.map((l) => l.cash)).eq(cash) || !sum(lines.map((l) => l.recovery)).eq(recovery))
    throw new Error("Allocation invariant violated");
  return lines;
}

export type AdvanceRow = { id: string; outstanding: Decimal.Value };
export type RecoveryPair = { advanceId: string; earningId: string; amount: Money };

/**
 * Splits the recovery portion of each earning across the worker's advances, OLDEST ADVANCE FIRST
 * (two-pointer walk). `advances` must already be ordered oldest first.
 */
export function pairRecoveries(advances: AdvanceRow[], parts: { earningId: string; amount: Decimal.Value }[]): RecoveryPair[] {
  const pairs: RecoveryPair[] = [];
  let i = 0;
  let advLeft = advances.length ? money(advances[0]!.outstanding) : ZERO;

  for (const part of parts) {
    let need = money(part.amount);
    while (need.gt(0)) {
      while (i < advances.length && advLeft.lte(0)) {
        i++;
        advLeft = i < advances.length ? money(advances[i]!.outstanding) : ZERO;
      }
      if (i >= advances.length) throw new DomainError("EXCEEDS_ADVANCE_BALANCE", "The recovery is more than the worker's unrecovered advance.");
      const take = minMoney(need, advLeft);
      pairs.push({ advanceId: advances[i]!.id, earningId: part.earningId, amount: take });
      need = need.minus(take);
      advLeft = advLeft.minus(take);
    }
  }
  return pairs;
}
