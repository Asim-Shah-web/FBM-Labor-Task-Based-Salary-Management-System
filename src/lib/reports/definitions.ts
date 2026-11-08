import type { ReportType } from "./types";

export type FilterKey = "month" | "period" | "asOf" | "worker" | "workerRequired" | "department" | "task";

export const REPORTS: { type: ReportType; title: string; description: string; filters: FilterKey[] }[] = [
  {
    type: "monthly-wage",
    title: "Monthly Wage Report",
    description: "Per worker: task earnings, allowances, total earned (by work date), cash paid in the month (by payment date), and outstanding wages.",
    filters: ["month", "worker", "department"],
  },
  {
    type: "worker-statement",
    title: "Worker Salary Statement",
    description: "One worker: daily earnings, allowances, payment allocations, paid / partially paid / unpaid dates, advances, and remaining balance.",
    filters: ["period", "workerRequired"],
  },
  {
    type: "attendance",
    title: "Attendance Report",
    description: "Present, absent, and leave days per worker for a month or date range.",
    filters: ["period", "worker", "department"],
  },
  {
    type: "production",
    title: "Production Report",
    description: "Task-wise quantities, worker-wise production, and daily and monthly totals (approved entries only).",
    filters: ["period", "worker", "department", "task"],
  },
  {
    type: "outstanding",
    title: "Outstanding Salary Report",
    description: "Every work date that still has unpaid wages: original earnings, amount settled, remaining unpaid, as of a chosen date.",
    filters: ["asOf", "worker", "department"],
  },
  {
    type: "advances",
    title: "Advance Report",
    description: "Advances issued, amounts recovered through settlements, and outstanding advances.",
    filters: ["period", "worker", "department"],
  },
];

export const isReportType = (t: string): t is ReportType => REPORTS.some((r) => r.type === t);
