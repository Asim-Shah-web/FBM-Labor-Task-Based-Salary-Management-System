"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { createWorkerAction, updateWorkerAction } from "@/app/actions/workers";
import { workerSchema, type WorkerInput } from "@/lib/validators/worker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export function WorkerForm({
  mode, workerId, defaults, departments, today,
}: {
  mode: "create" | "edit"; workerId?: string; defaults?: Partial<WorkerInput>; departments: string[]; today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<WorkerInput>({
    resolver: zodResolver(workerSchema),
    defaultValues: { code: "", fullName: "", phone: "", department: "", jobRole: "", joiningDate: today, notes: "", ...defaults },
  });

  const onSubmit = (values: WorkerInput) =>
    start(async () => {
      setFeedback(null);
      if (mode === "create") {
        const res = await createWorkerAction(values);
        if (!res.ok) return setFeedback({ ok: false, text: res.error });
        router.push(`/workers/${res.data?.id ?? ""}`);
      } else {
        const res = await updateWorkerAction(workerId!, values);
        if (!res.ok) return setFeedback({ ok: false, text: res.error });
        router.push(`/workers/${workerId}`);
      }
      router.refresh();
    });

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          {mode === "create" && (
            <Field label="Worker code" error={errors.code?.message} hint="Leave empty to auto-generate (W-0001, W-0002, ...)">
              <Input {...register("code")} placeholder="Auto" autoCapitalize="characters" />
            </Field>
          )}
          <Field label="Full name *" error={errors.fullName?.message}>
            <Input {...register("fullName")} autoComplete="off" />
          </Field>
          <Field label="Phone (optional)" error={errors.phone?.message}>
            <Input {...register("phone")} type="tel" inputMode="tel" />
          </Field>
          <Field label="Department (optional)" error={errors.department?.message}>
            <Input {...register("department")} list="departments" placeholder="e.g. Stitching" />
            <datalist id="departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
          </Field>
          <Field label="Job role (optional)" error={errors.jobRole?.message}>
            <Input {...register("jobRole")} />
          </Field>
          <Field label="Joining date *" error={errors.joiningDate?.message}>
            <Input {...register("joiningDate")} type="date" max={today} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes (optional)" error={errors.notes?.message}>
              <Textarea {...register("notes")} />
            </Field>
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FeedbackMessage feedback={feedback} />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "create" ? "Create worker" : "Save changes"}</Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
