import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  INACTIVE: { label: "Inactive", variant: "neutral" },
  PRESENT: { label: "Present", variant: "success" },
  ABSENT: { label: "Absent", variant: "danger" },
  LEAVE: { label: "Leave", variant: "info" },
  DRAFT: { label: "Draft", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  VOIDED: { label: "Voided", variant: "neutral" },
  PAID: { label: "Paid", variant: "success" },
  PARTIAL: { label: "Partially Paid", variant: "warning" },
  UNPAID: { label: "Unpaid", variant: "danger" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
