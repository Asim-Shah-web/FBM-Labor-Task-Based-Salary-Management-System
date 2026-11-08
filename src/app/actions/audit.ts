"use server";

import { runAction } from "@/server/action-result";
import { requirePermission } from "@/server/authz/require";
import { runIntegrityChecks, type CheckResult } from "@/server/services/reconcile.service";
import { audit } from "@/server/services/audit.service";

export async function runIntegrityCheckAction() {
  return runAction<CheckResult[]>(async () => {
    const user = await requirePermission("audit:read");
    const results = await runIntegrityChecks();
    await audit({ userId: user.id, action: "integrity.check", meta: { failed: results.filter((r) => !r.ok).map((r) => r.id) } });
    return { data: results };
  });
}
