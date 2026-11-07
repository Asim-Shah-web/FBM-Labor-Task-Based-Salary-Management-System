import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { DomainError } from "@/server/errors";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { workerSchema, type WorkerInput } from "@/lib/validators/worker";
import type { Actor } from "@/server/guards";
import { audit } from "./audit.service";

export type WorkerRow = {
  id: string; code: string; fullName: string; phone: string | null; department: string | null;
  jobRole: string | null; joiningDate: string; status: "ACTIVE" | "INACTIVE";
};

export async function listWorkers(filter: { q?: string; status?: "ACTIVE" | "INACTIVE"; department?: string }): Promise<WorkerRow[]> {
  const where: Prisma.WorkerWhereInput = {};
  if (filter.status) where.status = filter.status;
  if (filter.department) where.department = { name: filter.department };
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }
  const rows = await prisma.worker.findMany({ where, include: { department: true }, orderBy: { code: "asc" }, take: 500 });
  return rows.map((w) => ({
    id: w.id, code: w.code, fullName: w.fullName, phone: w.phone, department: w.department?.name ?? null,
    jobRole: w.jobRole, joiningDate: fromDbDate(w.joiningDate), status: w.status,
  }));
}

export const listDepartments = async () =>
  (await prisma.department.findMany({ orderBy: { name: "asc" } })).map((d) => d.name);

export async function getWorker(id: string) {
  const w = await prisma.worker.findUnique({ where: { id }, include: { department: true } });
  if (!w) return null;
  return {
    id: w.id, code: w.code, fullName: w.fullName, phone: w.phone, department: w.department?.name ?? null,
    jobRole: w.jobRole, joiningDate: fromDbDate(w.joiningDate), status: w.status, notes: w.notes,
    createdAt: w.createdAt.toISOString(),
  };
}

async function nextWorkerCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.worker.findMany({ where: { code: { startsWith: "W-" } }, select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^W-(\d+)$/.exec(r.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `W-${String(max + 1).padStart(4, "0")}`;
}

async function departmentId(tx: Prisma.TransactionClient, name?: string) {
  if (!name) return null;
  const d = await tx.department.upsert({ where: { name }, update: {}, create: { name } });
  return d.id;
}

export async function createWorker(actor: Actor, input: WorkerInput) {
  const data = workerSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const code = data.code ?? (await nextWorkerCode(tx));
    if (await tx.worker.findUnique({ where: { code } }))
      throw new DomainError("WORKER_CODE_EXISTS", `Worker code ${code} is already used.`);
    const worker = await tx.worker.create({
      data: {
        code, fullName: data.fullName, phone: data.phone, jobRole: data.jobRole, notes: data.notes,
        joiningDate: toDbDate(data.joiningDate), departmentId: await departmentId(tx, data.department),
      },
    });
    await audit(
      { userId: actor.id, action: "worker.create", entityType: "Worker", entityId: worker.id,
        after: { code, fullName: data.fullName, department: data.department ?? null, joiningDate: data.joiningDate } },
      tx,
    );
    return worker;
  });
}

/** The worker code never changes after creation. */
export async function updateWorker(actor: Actor, id: string, input: WorkerInput) {
  const data = workerSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.worker.findUnique({ where: { id }, include: { department: true } });
    if (!before) throw new DomainError("NOT_FOUND", "Worker not found.");
    const after = await tx.worker.update({
      where: { id },
      data: {
        fullName: data.fullName, phone: data.phone ?? null, jobRole: data.jobRole ?? null, notes: data.notes ?? null,
        joiningDate: toDbDate(data.joiningDate), departmentId: await departmentId(tx, data.department),
      },
      include: { department: true },
    });
    const snap = (w: typeof before) => ({
      fullName: w.fullName, phone: w.phone, department: w.department?.name ?? null, jobRole: w.jobRole,
      joiningDate: fromDbDate(w.joiningDate), notes: w.notes,
    });
    await audit({ userId: actor.id, action: "worker.update", entityType: "Worker", entityId: id, before: snap(before), after: snap(after) }, tx);
  });
}

/** Deactivating never deletes any history; the worker simply stops appearing in daily entry screens. */
export async function setWorkerStatus(actor: Actor, id: string, status: "ACTIVE" | "INACTIVE") {
  return prisma.$transaction(async (tx) => {
    const w = await tx.worker.update({ where: { id }, data: { status } });
    await audit({ userId: actor.id, action: status === "ACTIVE" ? "worker.activate" : "worker.deactivate", entityType: "Worker", entityId: w.id }, tx);
  });
}

export async function getWorkerProfileData(id: string) {
  const [attendance, entries, allowances, attendanceCounts, earned, advances, payments, advanceRows] = await Promise.all([
    prisma.attendance.findMany({ where: { workerId: id }, orderBy: { date: "desc" }, take: 60 }),
    prisma.dailyWorkEntry.findMany({
      where: { workerId: id }, orderBy: [{ workDate: "desc" }, { createdAt: "desc" }], take: 100,
      include: { task: { select: { code: true, name: true, unitLabel: true } } },
    }),
    prisma.dailyAllowance.findMany({ where: { workerId: id }, orderBy: { workDate: "desc" }, take: 60 }),
    prisma.attendance.groupBy({ by: ["status"], where: { workerId: id }, _count: { _all: true } }),
    prisma.earning.aggregate({ where: { workerId: id, status: "ACTIVE" }, _sum: { amount: true, settledAmount: true } }),
    prisma.advance.aggregate({ where: { workerId: id, status: "ACTIVE" }, _sum: { amount: true, recoveredAmount: true } }),
    prisma.salaryPayment.findMany({ where: { workerId: id }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], take: 20 }),
    prisma.advance.findMany({ where: { workerId: id }, orderBy: { advanceDate: "desc" }, take: 20 }),
  ]);
  const zero = new Prisma.Decimal(0);
  const totalEarned = earned._sum.amount ?? zero;
  const totalSettled = earned._sum.settledAmount ?? zero;
  const advIssued = advances._sum.amount ?? zero;
  const advRecovered = advances._sum.recoveredAmount ?? zero;
  return {
    attendance: attendance.map((a) => ({ id: a.id, date: fromDbDate(a.date), status: a.status })),
    attendanceCounts: Object.fromEntries(attendanceCounts.map((c) => [c.status, c._count._all])) as Record<string, number>,
    entries: entries.map((e) => ({
      id: e.id, workDate: fromDbDate(e.workDate), task: e.task.name, unit: e.task.unitLabel, quantity: e.quantity.toString(),
      rate: e.appliedRate.toString(), amount: e.amount.toString(), status: e.status,
    })),
    allowances: allowances.map((a) => ({ id: a.id, workDate: fromDbDate(a.workDate), amount: a.amount.toString(), reason: a.reason, status: a.status })),
    payments: payments.map((p) => ({
      id: p.id, receiptNo: p.receiptNo, paymentDate: fromDbDate(p.paymentDate), periodStart: fromDbDate(p.periodStart),
      periodEnd: fromDbDate(p.periodEnd), cash: p.cashAmount.toString(), recovery: p.advanceRecoveryAmount.toString(), status: p.status,
    })),
    advanceRows: advanceRows.map((a) => ({
      id: a.id, date: fromDbDate(a.advanceDate), amount: a.amount.toString(), recovered: a.recoveredAmount.toString(), status: a.status,
    })),
    totals: {
      earned: totalEarned.toString(), settled: totalSettled.toString(),
      outstanding: totalEarned.minus(totalSettled).toString(),
      advanceIssued: advIssued.toString(), advanceUnrecovered: advIssued.minus(advRecovered).toString(),
    },
  };
}
