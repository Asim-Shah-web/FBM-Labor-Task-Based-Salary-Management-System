import { todayKarachi } from "@/lib/dates";
import { DomainError } from "@/server/errors";

export type Actor = { id: string };

/** Daily records cannot be entered for a future date. */
export function assertWorkDateAllowed(workDate: string): void {
  if (workDate > todayKarachi()) throw new DomainError("FUTURE_DATE", "You cannot enter records for a future date.");
}
