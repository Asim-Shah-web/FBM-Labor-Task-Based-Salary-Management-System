// Work dates are calendar dates (no time, no timezone). They travel through the app as
// "YYYY-MM-DD" strings and are stored in PostgreSQL DATE columns. Never use `new Date()`
// arithmetic for them: that is how off-by-one-day bugs happen.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isValidIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejects 2026-02-30
}

/** "YYYY-MM-DD" -> Date at UTC midnight (what Prisma stores in a DATE column). */
export function toDbDate(s: string): Date {
  if (!isValidIsoDate(s)) throw new Error(`Invalid date: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

export const fromDbDate = (d: Date): string => d.toISOString().slice(0, 10);

/** Today's calendar date in Pakistan (the factory's timezone), regardless of server timezone. */
export function todayKarachi(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function addDays(s: string, days: number): string {
  const d = toDbDate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

/** "2026-11-06" -> "06 Nov 2026" */
export function formatDate(s: string): string {
  if (!isValidIsoDate(s)) return s;
  const [y, m, d] = s.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Use a ?date= search param if valid and not in the future, otherwise today. */
export function resolveDateParam(param: string | undefined, today = todayKarachi()): string {
  if (param && isValidIsoDate(param) && param <= today) return param;
  return today;
}

/** "2026-11-07T14:32:00Z" -> "07 Nov 2026, 19:32" in Pakistan time. */
export function formatDateTimeKarachi(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")} ${g("month")} ${g("year")}, ${g("hour")}:${g("minute")}`;
}
