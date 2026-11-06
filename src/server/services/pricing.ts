// Pure pricing logic (no database): easy to unit-test and used by the services.
import type Decimal from "decimal.js";
import { lineAmount, money } from "@/server/money/decimal";

export type PricingMethod = "PER_UNIT" | "FIXED_PER_TASK";

export type RateVersion = { id: string; rate: Decimal.Value; effectiveFrom: string /* YYYY-MM-DD */ };

/** The rate in force on `workDate`: the version with the greatest effectiveFrom <= workDate. */
export function pickRate<T extends { effectiveFrom: string }>(history: T[], workDate: string): T | null {
  let best: T | null = null;
  for (const v of history) {
    if (v.effectiveFrom <= workDate && (!best || v.effectiveFrom > best.effectiveFrom)) best = v;
  }
  return best;
}

const MAX_QUANTITY = 1_000_000;

/** Returns an error message, or null if the quantity is valid for the pricing method. */
export function validateQuantity(method: PricingMethod, quantity: Decimal.Value): string | null {
  let q;
  try {
    q = money(quantity);
  } catch {
    return "Quantity must be a number.";
  }
  if (!q.isFinite()) return "Quantity must be a number.";
  if (q.lte(0)) return "Quantity must be greater than zero.";
  if (q.gt(MAX_QUANTITY)) return `Quantity cannot exceed ${MAX_QUANTITY.toLocaleString("en-US")}.`;
  if (method === "FIXED_PER_TASK" && !q.isInteger()) return "Fixed-amount tasks must use a whole number of completed tasks.";
  if (q.decimalPlaces() > 3) return "Quantity can have at most 3 decimal places.";
  return null;
}

/** Both pricing methods compute quantity x rate; the method only affects labels and validation. */
export const entryAmount = (quantity: Decimal.Value, rate: Decimal.Value) => lineAmount(quantity, rate);
