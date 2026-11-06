"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { requirePermission } from "@/server/authz/require";
import { createWorker, setWorkerStatus, updateWorker } from "@/server/services/worker.service";
import type { WorkerInput } from "@/lib/validators/worker";

export async function createWorkerAction(input: WorkerInput) {
  return runAction<{ id: string }>(async () => {
    const user = await requirePermission("worker:write");
    const w = await createWorker(user, input);
    revalidatePath("/workers");
    return { data: { id: w.id }, message: `Worker ${w.code} created.` };
  });
}

export async function updateWorkerAction(id: string, input: WorkerInput) {
  return runAction(async () => {
    const user = await requirePermission("worker:write");
    await updateWorker(user, id, input);
    revalidatePath("/workers");
    revalidatePath(`/workers/${id}`);
    return { message: "Worker updated." };
  });
}

export async function setWorkerStatusAction(id: string, status: "ACTIVE" | "INACTIVE") {
  return runAction(async () => {
    const user = await requirePermission("worker:write");
    await setWorkerStatus(user, id, status);
    revalidatePath("/workers");
    revalidatePath(`/workers/${id}`);
    return { message: status === "ACTIVE" ? "Worker activated." : "Worker deactivated. History is kept." };
  });
}
