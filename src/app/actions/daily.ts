"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { requirePermission } from "@/server/authz/require";
import { saveAttendance, type AttendanceStatus } from "@/server/services/attendance.service";
import { approveDay, approveEntries, correctEntryQuantity, createEntries, voidEntry } from "@/server/services/work-entry.service";
import { saveAllowances, voidAllowance } from "@/server/services/allowance.service";
import { formatPKR } from "@/server/money/decimal";

function refresh() {
  for (const p of ["/attendance", "/work-entry", "/allowances", "/workers", "/dashboard"]) revalidatePath(p);
}

export async function saveAttendanceAction(input: { date: string; rows: { workerId: string; status: AttendanceStatus }[] }) {
  return runAction(async () => {
    const user = await requirePermission("attendance:write");
    const r = await saveAttendance(user, input);
    refresh();
    const parts = [r.created && `${r.created} marked`, r.corrected && `${r.corrected} corrected`, r.unchanged && `${r.unchanged} unchanged`].filter(Boolean);
    return { message: `Attendance saved: ${parts.join(", ") || "nothing to change"}.` };
  });
}

export async function createEntriesAction(input: { workDate: string; approve: boolean; lines: { workerId: string; taskId: string; quantity: string }[] }) {
  return runAction(async () => {
    const user = await requirePermission("work:write");
    const r = await createEntries(user, input);
    refresh();
    return { message: `${r.count} entr${r.count === 1 ? "y" : "ies"} ${input.approve ? "saved and approved" : "saved as draft"} (${formatPKR(r.total)}).` };
  });
}

export async function approveEntryAction(id: string) {
  return runAction(async () => {
    const user = await requirePermission("work:write");
    await approveEntries(user, [id]);
    refresh();
    return { message: "Entry approved." };
  });
}

export async function approveDayAction(workDate: string) {
  return runAction(async () => {
    const user = await requirePermission("work:write");
    const n = await approveDay(user, workDate);
    refresh();
    return { message: n ? `${n} draft entr${n === 1 ? "y" : "ies"} approved.` : "There are no drafts to approve." };
  });
}

export async function voidEntryAction(id: string, reason: string) {
  return runAction(async () => {
    const user = await requirePermission("work:write");
    await voidEntry(user, id, reason);
    refresh();
    return { message: "Entry voided." };
  });
}

export async function correctEntryAction(id: string, quantity: string, reason: string) {
  return runAction(async () => {
    const user = await requirePermission("work:write");
    await correctEntryQuantity(user, id, quantity, reason);
    refresh();
    return { message: "Entry corrected." };
  });
}

export async function saveAllowancesAction(input: { workDate: string; rows: { workerId: string; amount: string; reason?: string }[] }) {
  return runAction(async () => {
    const user = await requirePermission("allowance:write");
    const r = await saveAllowances(user, input);
    refresh();
    const parts = [r.created && `${r.created} added`, r.replaced && `${r.replaced} changed`, r.unchanged && `${r.unchanged} unchanged`].filter(Boolean);
    return { message: `Allowances saved: ${parts.join(", ") || "nothing to change"}.` };
  });
}

export async function voidAllowanceAction(id: string, reason: string) {
  return runAction(async () => {
    const user = await requirePermission("allowance:write");
    await voidAllowance(user, id, reason);
    refresh();
    return { message: "Allowance voided." };
  });
}
