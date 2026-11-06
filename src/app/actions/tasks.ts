"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { requirePermission } from "@/server/authz/require";
import { createTask, setTaskActive, updateTask } from "@/server/services/task.service";
import { changeRate } from "@/server/services/rates.service";
import type { ChangeRateInput, CreateTaskInput, UpdateTaskInput } from "@/lib/validators/task";

export async function createTaskAction(input: CreateTaskInput) {
  return runAction<{ id: string }>(async () => {
    const user = await requirePermission("task:write");
    const t = await createTask(user, input);
    revalidatePath("/tasks");
    return { data: { id: t.id }, message: "Task created." };
  });
}

export async function updateTaskAction(id: string, input: UpdateTaskInput) {
  return runAction(async () => {
    const user = await requirePermission("task:write");
    await updateTask(user, id, input);
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${id}`);
    return { message: "Task updated." };
  });
}

export async function setTaskActiveAction(id: string, isActive: boolean) {
  return runAction(async () => {
    const user = await requirePermission("task:write");
    await setTaskActive(user, id, isActive);
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${id}`);
    return { message: isActive ? "Task activated." : "Task deactivated." };
  });
}

export async function changeRateAction(taskId: string, input: ChangeRateInput) {
  return runAction(async () => {
    const user = await requirePermission("rate:change");
    await changeRate(user, taskId, input);
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${taskId}`);
    return { message: "New rate saved. Existing entries keep their original rates." };
  });
}
