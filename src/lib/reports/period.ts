import { addDays, isValidIsoDate, todayKarachi } from "@/lib/dates";
import { DomainError } from "@/server/errors";
import type { ReportParams } from "./types";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_RANGE_DAYS = 366;

export const isValidMonth = (m: string) => MONTH.test(m);

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Month wins; otherwise a start/end range; otherwise the current month up to today. */
export function resolvePeriod(p: ReportParams, today: string = todayKarachi()): { start: string; end: string; label: string } {
  let start: string, end: string;
  if (p.month && isValidMonth(p.month)) ({ start, end } = monthBounds(p.month));
  else if (p.start && p.end && isValidIsoDate(p.start) && isValidIsoDate(p.end)) { start = p.start; end = p.end; }
  else { start = `${today.slice(0, 7)}-01`; end = today; }
  if (start > end) throw new DomainError("BAD_RANGE", "The start date must be on or before the end date.");
  if (daysBetween(start, end) > MAX_RANGE_DAYS) throw new DomainError("RANGE_TOO_LONG", `Choose a period of at most ${MAX_RANGE_DAYS} days.`);
  return { start, end, label: `${start} to ${end}` };
}

export function parseParams(sp: Record<string, string | string[] | undefined>): ReportParams {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  return { month: one("month"), start: one("start"), end: one("end"), asOf: one("asOf"), workerId: one("workerId"), department: one("department"), taskId: one("taskId") };
}

export function resolveAsOf(p: ReportParams, today: string = todayKarachi()): string {
  const d = p.asOf && isValidIsoDate(p.asOf) ? p.asOf : today;
  return d > today ? today : d;
}

export { addDays };
