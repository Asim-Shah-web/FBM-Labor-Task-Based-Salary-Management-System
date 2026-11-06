import { cn } from "@/lib/utils";

export type Feedback = { ok: boolean; text: string } | null;

export function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.ok ? "status" : "alert"}
      className={cn("rounded-md p-3 text-sm", feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-destructive/10 text-destructive")}
    >
      {feedback.text}
    </p>
  );
}
