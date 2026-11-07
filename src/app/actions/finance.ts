"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { requirePermission } from "@/server/authz/require";
import { postSettlement, reverseSettlement } from "@/server/services/settlement.service";
import { issueAdvance, voidAdvance } from "@/server/services/advance.service";
import { parseMoney } from "@/server/money/decimal";
import type { AdvanceInput, SettlementInput } from "@/lib/validators/finance";

function refresh() {
  for (const p of ["/salary", "/advances", "/dashboard", "/workers"]) revalidatePath(p);
}

export async function postSettlementAction(input: SettlementInput) {
  return runAction<{ id: string; receiptNo: string }>(async () => {
    const user = await requirePermission("settlement:create");
    // Recovering an advance is a separate, explicit permission (and an explicit amount).
    const recovery = parseMoney(String(input.advanceRecoveryAmount ?? "0"));
    if (recovery && recovery.gt(0)) await requirePermission("advance:recover");
    const r = await postSettlement(user, input);
    refresh();
    return { data: { id: r.id, receiptNo: r.receiptNo }, message: `Settlement ${r.receiptNo} recorded.` };
  });
}

export async function reverseSettlementAction(paymentId: string, reason: string) {
  return runAction(async () => {
    const user = await requirePermission("settlement:reverse");
    await reverseSettlement(user, paymentId, reason);
    refresh();
    revalidatePath(`/salary/payments/${paymentId}`);
    return { message: "Settlement reversed. The wages are outstanding again." };
  });
}

export async function issueAdvanceAction(input: AdvanceInput) {
  return runAction(async () => {
    const user = await requirePermission("advance:issue");
    await issueAdvance(user, input);
    refresh();
    return { message: "Advance recorded." };
  });
}

export async function voidAdvanceAction(id: string, reason: string) {
  return runAction(async () => {
    const user = await requirePermission("advance:void");
    await voidAdvance(user, id, reason);
    refresh();
    return { message: "Advance voided." };
  });
}
