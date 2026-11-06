import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { attendanceSaveSchema } from "@/lib/validators/daily";
import { assertWorkDateAllowed, type Actor } from "@/server/guards";
import { audit } from "./audit.service";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE";

export async function getAttendanceForDate(date: string): Promise<Record<string, AttendanceStatus>> {
  const rows = await prisma.attendance.findMany({ where: { date: toDbDate(date) } });
  return Object.fromEntries(rows.map((r) => [r.workerId, r.status]));
}

/**
 * Bulk save: one record per worker per date. New marks are created; a different status for an
 * already-marked worker is a correction and gets its own audit entry (before/after).
 * Attendance never creates wages or allowances.
 */
export async function saveAttendance(actor: Actor, input: { date: string; rows: { workerId: string; status: AttendanceStatus }[] }) {
  const data = attendanceSaveSchema.parse(input);
  assertWorkDateAllowed(data.date);
  const date = toDbDate(data.date);

  return prisma.$transaction(async (tx) => {
    const ids = [...new Set(data.rows.map((r) => r.workerId))];
    const workers = await tx.worker.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (workers.length !== ids.length) throw new DomainError("NOT_FOUND", "One of the workers no longer exists.");

    const existing = new Map((await tx.attendance.findMany({ where: { date, workerId: { in: ids } } })).map((a) => [a.workerId, a]));
    let created = 0, corrected = 0, unchanged = 0;

    for (const row of data.rows) {
      const cur = existing.get(row.workerId);
      if (!cur) {
        const a = await tx.attendance.create({ data: { workerId: row.workerId, date, status: row.status, recordedById: actor.id } });
        await audit({ userId: actor.id, action: "attendance.mark", entityType: "Attendance", entityId: a.id, after: { workerId: row.workerId, date: data.date, status: row.status } }, tx);
        created++;
      } else if (cur.status !== row.status) {
        await tx.attendance.update({ where: { id: cur.id }, data: { status: row.status, recordedById: actor.id } });
        await audit({
          userId: actor.id, action: "attendance.correct", entityType: "Attendance", entityId: cur.id,
          before: { status: cur.status, date: fromDbDate(cur.date) }, after: { status: row.status, date: data.date },
        }, tx);
        corrected++;
      } else unchanged++;
    }
    return { created, corrected, unchanged };
  });
}
