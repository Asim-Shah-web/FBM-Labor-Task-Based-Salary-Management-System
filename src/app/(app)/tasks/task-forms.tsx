"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { changeRateAction, createTaskAction, setTaskActiveAction, updateTaskAction } from "@/app/actions/tasks";
import {
  changeRateSchema, createTaskSchema, updateTaskSchema,
  type ChangeRateInput, type CreateTaskInput, type UpdateTaskInput,
} from "@/lib/validators/task";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { FeedbackMessage, type Feedback } from "@/components/shared/feedback";

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CreateTaskForm({ today }: { today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { code: "", name: "", pricingMethod: "PER_UNIT", unitLabel: "unit", rate: "", effectiveFrom: today },
  });
  const method = watch("pricingMethod");

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <form
          className="grid gap-4 sm:grid-cols-2" noValidate
          onSubmit={handleSubmit((v) => start(async () => {
            setFeedback(null);
            const r = await createTaskAction(v);
            if (!r.ok) return setFeedback({ ok: false, text: r.error });
            router.push(`/tasks/${r.data?.id ?? ""}`);
            router.refresh();
          }))}
        >
          <Field label="Task code *" error={errors.code?.message} hint="e.g. STITCH">
            <Input {...register("code")} autoCapitalize="characters" />
          </Field>
          <Field label="Task name *" error={errors.name?.message}>
            <Input {...register("name")} />
          </Field>
          <Field label="Pricing method *" error={errors.pricingMethod?.message} hint="Cannot be changed later.">
            <NativeSelect {...register("pricingMethod")}>
              <option value="PER_UNIT">Per unit (quantity x rate)</option>
              <option value="FIXED_PER_TASK">Fixed amount per completed task</option>
            </NativeSelect>
          </Field>
          {method === "PER_UNIT" && (
            <Field label="Unit label" error={errors.unitLabel?.message} hint="e.g. unit, piece, board">
              <Input {...register("unitLabel")} />
            </Field>
          )}
          <Field label="Standard rate (PKR) *" error={errors.rate?.message}>
            <Input {...register("rate")} inputMode="decimal" placeholder="50" />
          </Field>
          <Field label="Rate effective from *" error={errors.effectiveFrom?.message}>
            <Input {...register("effectiveFrom")} type="date" />
          </Field>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FeedbackMessage feedback={feedback} />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Create task</Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function EditTaskForm({ taskId, defaults }: { taskId: string; defaults: UpdateTaskInput }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<UpdateTaskInput>({ resolver: zodResolver(updateTaskSchema), defaultValues: defaults });

  return (
    <Card>
      <CardHeader><CardTitle>Task details</CardTitle></CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4" noValidate
          onSubmit={handleSubmit((v) => start(async () => {
            const r = await updateTaskAction(taskId, v);
            setFeedback({ ok: r.ok, text: r.ok ? r.message ?? "Saved." : r.error });
            if (r.ok) router.refresh();
          }))}
        >
          <Field label="Task name" error={errors.name?.message}><Input {...register("name")} /></Field>
          <Field label="Unit label" error={errors.unitLabel?.message}><Input {...register("unitLabel")} /></Field>
          <FeedbackMessage feedback={feedback} />
          <Button type="submit" disabled={pending} className="self-start">{pending && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ChangeRateForm({ taskId, today }: { taskId: string; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangeRateInput>({
    resolver: zodResolver(changeRateSchema),
    defaultValues: { rate: "", effectiveFrom: today, reason: "" },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Change rate</CardTitle></CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4" noValidate
          onSubmit={handleSubmit((v) => start(async () => {
            const r = await changeRateAction(taskId, v);
            setFeedback({ ok: r.ok, text: r.ok ? r.message ?? "Saved." : r.error });
            if (r.ok) { reset({ rate: "", effectiveFrom: today, reason: "" }); router.refresh(); }
          }))}
        >
          <p className="text-sm text-muted-foreground">
            The new rate applies to work dated on or after the effective date. Entries already recorded keep their original rate.
          </p>
          <Field label="New rate (PKR)" error={errors.rate?.message}><Input {...register("rate")} inputMode="decimal" /></Field>
          <Field label="Effective from" error={errors.effectiveFrom?.message}><Input {...register("effectiveFrom")} type="date" /></Field>
          <Field label="Reason (optional)" error={errors.reason?.message}><Input {...register("reason")} /></Field>
          <FeedbackMessage feedback={feedback} />
          <Button type="submit" disabled={pending} className="self-start">{pending && <Loader2 className="h-4 w-4 animate-spin" />} Save new rate</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function TaskActiveButton({ taskId, isActive }: { taskId: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline" disabled={pending}
        onClick={() => start(async () => {
          const r = await setTaskActiveAction(taskId, !isActive);
          if (!r.ok) setError(r.error); else router.refresh();
        })}
      >
        {isActive ? "Deactivate task" : "Activate task"}
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
