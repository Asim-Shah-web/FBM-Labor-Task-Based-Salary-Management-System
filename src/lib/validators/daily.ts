import { z } from "zod";
import { decimalString, isoDate } from "./common";

export const attendanceSaveSchema = z.object({
  date: isoDate,
  rows: z
    .array(z.object({ workerId: z.string().min(1), status: z.enum(["PRESENT", "ABSENT", "LEAVE"]) }))
    .min(1, "Mark at least one worker.")
    .max(500),
});

export const workLinesSchema = z.object({
  workDate: isoDate,
  approve: z.boolean(),
  lines: z
    .array(
      z.object({
        workerId: z.string().min(1, "Choose a worker."),
        taskId: z.string().min(1, "Choose a task."),
        quantity: decimalString("Quantity", { decimals: 3 }),
      }),
    )
    .min(1, "Add at least one line.")
    .max(200),
});

export const reasonSchema = z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(300);

export const allowanceSaveSchema = z.object({
  workDate: isoDate,
  rows: z
    .array(
      z.object({
        workerId: z.string().min(1),
        amount: decimalString("Allowance", { allowZero: true, max: 1_000_000 }),
        reason: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
      }),
    )
    .min(1, "Enter at least one allowance.")
    .max(500),
});
