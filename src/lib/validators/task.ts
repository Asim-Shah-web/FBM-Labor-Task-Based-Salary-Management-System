import { z } from "zod";
import { decimalString, isoDate, optionalText } from "./common";

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "Code: 2-20 letters, numbers or dashes.");

export const createTaskSchema = z.object({
  code,
  name: z.string().trim().min(2, "Enter the task name.").max(80),
  pricingMethod: z.enum(["PER_UNIT", "FIXED_PER_TASK"]),
  unitLabel: optionalText(30),
  rate: decimalString("Rate"),
  effectiveFrom: isoDate,
});

export const updateTaskSchema = z.object({
  name: z.string().trim().min(2, "Enter the task name.").max(80),
  unitLabel: optionalText(30),
});

export const changeRateSchema = z.object({
  rate: decimalString("Rate"),
  effectiveFrom: isoDate,
  reason: optionalText(200),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type ChangeRateInput = z.input<typeof changeRateSchema>;
