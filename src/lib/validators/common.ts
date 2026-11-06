import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";

export const isoDate = z.string().refine(isValidIsoDate, "Enter a valid date.");

/** A money/quantity string such as "230" or "1,500.50". Kept as a string: never a JS float. */
export const decimalString = (label: string, opts: { max?: number; allowZero?: boolean; decimals?: number } = {}) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => /^\d+(\.\d+)?$/.test(v), `${label} must be a number.`)
    .refine((v) => (v.split(".")[1]?.length ?? 0) <= (opts.decimals ?? 2), `${label} can have at most ${opts.decimals ?? 2} decimal places.`)
    .refine((v) => (opts.allowZero ? Number(v) >= 0 : Number(v) > 0), opts.allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`)
    .refine((v) => Number(v) <= (opts.max ?? 10_000_000), `${label} is too large.`);

export const optionalText = (max: number) =>
  z.string().trim().max(max, `Too long (max ${max} characters).`).optional().transform((v) => (v ? v : undefined));
