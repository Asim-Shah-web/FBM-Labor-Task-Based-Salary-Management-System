import { z } from "zod";
import { decimalString, isoDate, optionalText } from "./common";

export const settlementSchema = z
  .object({
    workerId: z.string().min(1, "Choose a worker."),
    paymentDate: isoDate,
    periodStart: isoDate,
    periodEnd: isoDate,
    cashAmount: decimalString("Cash amount", { allowZero: true, max: 100_000_000 }),
    advanceRecoveryAmount: decimalString("Advance recovery", { allowZero: true, max: 100_000_000 }),
    notes: optionalText(300),
    // Generated once per form load; makes a double-click / retry harmless.
    idempotencyKey: z.string().min(16, "Missing request key.").max(64),
  })
  .refine((v) => v.periodStart <= v.periodEnd, { message: "Period start must be on or before period end.", path: ["periodEnd"] });
export type SettlementInput = z.input<typeof settlementSchema>;

export const advanceSchema = z.object({
  workerId: z.string().min(1, "Choose a worker."),
  advanceDate: isoDate,
  amount: decimalString("Advance amount", { max: 10_000_000 }),
  notes: optionalText(300),
});
export type AdvanceInput = z.input<typeof advanceSchema>;
