import { z } from "zod";
import { isoDate, optionalText } from "./common";

export const workerSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z0-9-]{2,20})?$/, "Code may use letters, numbers and dashes (2-20 characters).")
    .optional()
    .transform((v) => (v ? v : undefined)),
  fullName: z.string().trim().min(2, "Enter the worker's full name.").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^([0-9+\-\s()]{7,20})?$/, "Enter a valid phone number.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  department: optionalText(80),
  jobRole: optionalText(80),
  joiningDate: isoDate,
  notes: optionalText(1000),
});
export type WorkerInput = z.input<typeof workerSchema>;
export type WorkerData = z.output<typeof workerSchema>;
