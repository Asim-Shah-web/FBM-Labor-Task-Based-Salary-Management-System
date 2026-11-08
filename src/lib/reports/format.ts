import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/server/money/decimal";
import type { Column } from "./types";

const STATUS_LABEL: Record<string, string> = {
  PAID: "Paid", PARTIAL: "Partially Paid", UNPAID: "Unpaid", ACTIVE: "Active", INACTIVE: "Inactive",
  POSTED: "Posted", REVERSED: "Reversed", VOIDED: "Voided",
};

/** Grouped number with 2 decimals, no currency prefix (compact: used in PDF). */
export function plainMoney(v: string): string {
  const [i, f = "00"] = Number.isNaN(Number(v)) ? [v] : Number(v).toFixed(2).split(".");
  return `${(i ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}

export function formatCell(col: Column, value: string | undefined, opts: { currency?: boolean } = {}): string {
  if (value === undefined || value === "") return "";
  switch (col.type) {
    case "money": return opts.currency === false ? plainMoney(value) : formatPKR(value, { decimals: 2 });
    case "date": return formatDate(value);
    case "status": return STATUS_LABEL[value] ?? value;
    case "int": return String(Number(value));
    default: return value;
  }
}

export const isNumeric = (t: Column["type"]) => t === "money" || t === "qty" || t === "int";
