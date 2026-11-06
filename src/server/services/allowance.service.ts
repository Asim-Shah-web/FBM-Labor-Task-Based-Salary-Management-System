// Daily extra allowance: discretionary, one active record per worker per date, may be zero,
// never derived from attendance. Kept separate from task earnings (own ledger rows).
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { allowanceSaveSchema, reasonSchema } from "@/lib/validators/daily";
import { money } from "@/server/money/decimal";
import { assertWorkDateAllowed, type Actor } from "@/server/guards";
import { audit } from "./audit.service";
import { createEarningForAllowance, reverseEarningForAllowance } from "./earnings.service";

export type AllowanceRow = { id: string; workerId: string; amount: string; reason: string | null; status: "DRAFT" | "APPROVED" | "VOIDED" };

export async function getAllowancesForDate(date: string): Promise<Record<string, AllowanceRow>> {
  const rows = await prisma.dailyAllowance.findMany({ where: { workDate: toDbDate(date), status: { not: "VOIDED" } } });
  return Object.fromEntries(rows.map((a) => [a.workerId, { id: a.id, workerId: a.workerId, amount: a.amount.toString(), reason: a.reason, status: a.status }]));
}

/**
 * Save allowances for a date. New -> created and approved. Changed -> the old record is voided
 * (its earning reversed) and a new approved one is created. Unchanged -> skipped.
 * Blocked if the old amount was already paid/recovered (reverse the settlement first).
 */
export async function saveAllowances(actor: Actor, input: { workDate: string; rows: { workerId: string; amount: string; reason?: string }[] }) {
  const data = allowanceSaveSchema.parse(input);
  assertWorkDateAllowed(data.workDate);
  const workDate = toDbDate(data.workDate);

  return prisma.$transaction(async (tx) => {
    const ids = data.rows.map((r) => r.workerId);
    if (new Set(ids).size !== ids.length) throw new DomainError("DUPLICATE_LINE", "A worker appears twice.");
    const workers = new Map((await tx.worker.findMany({ where: { id: { in: ids } } })).map((w) => [w.id, w]));
    const existing = new Map(
      (await tx.dailyAllowance.findMany({ where: { workDate, workerId: { in: ids }, status: { not: "VOIDED" } } })).map((a) => [a.workerId, a]),
    );
    let created = 0, replaced = 0, unchanged = 0;

    for (const row of data.rows) {
      const worker = workers.get(row.workerId);
      if (!worker) throw new DomainError("NOT_FOUND", "A selected worker no longer exists.");
      const cur = existing.get(row.workerId);
      const amount = money(row.amount);

      if (cur && money(cur.amount.toString()).eq(amount) && (cur.reason ?? "") === (row.reason ?? "")) { unchanged++; continue; }
      if (!cur && worker.status !== "ACTIVE") throw new DomainError("INACTIVE_WORKER", `${worker.fullName} is inactive.`);

      if (cur) {
        await reverseEarningForAllowance(tx, cur.id, "Allowance changed");
        await tx.dailyAllowance.update({
          where: { id: cur.id },
          data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: "Replaced by a corrected allowance" },
        });
      }
      const now = new Date();
      const created_ = await tx.dailyAllowance.create({
        data: { workerId: worker.id, workDate, amount: amount.toFixed(2), reason: row.reason, status: "APPROVED", createdById: actor.id, approvedById: actor.id, approvedAt: now },
      });
      await createEarningForAllowance(tx, created_);
      await audit({
        userId: actor.id, action: cur ? "allowance.replace" : "allowance.create", entityType: "DailyAllowance", entityId: created_.id,
        before: cur ? { amount: cur.amount.toString(), reason: cur.reason } : undefined,
        after: { worker: worker.code, workDate: data.workDate, amount: amount.toFixed(2), reason: row.reason ?? null },
      }, tx);
      cur ? replaced++ : created++;
    }
    return { created, replaced, unchanged };
  });
}

export async function voidAllowance(actor: Actor, id: string, reasonInput: string) {
  const reason = reasonSchema.parse(reasonInput);
  return prisma.$transaction(async (tx) => {
    const a = await tx.dailyAllowance.findUnique({ where: { id } });
    if (!a) throw new DomainError("NOT_FOUND", "Allowance not found.");
    if (a.status === "VOIDED") throw new DomainError("ALREADY_VOIDED", "Already voided.");
    await reverseEarningForAllowance(tx, id, `Allowance voided: ${reason}`);
    await tx.dailyAllowance.update({ where: { id }, data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: reason } });
    await audit({ userId: actor.id, action: "allowance.void", entityType: "DailyAllowance", entityId: id, before: { amount: a.amount.toString(), workDate: fromDbDate(a.workDate) }, meta: { reason } }, tx);
  });
}
