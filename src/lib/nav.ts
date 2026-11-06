import type { PermissionCode } from "@/server/authz/permissions";

export type NavKey =
  | "dashboard" | "workers" | "tasks" | "attendance" | "work-entry" | "allowances"
  | "salary" | "advances" | "reports";

export type NavItem = { key: NavKey; label: string; href: string; permission: PermissionCode; phase: number };

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", permission: "report:read", phase: 3 },
  { key: "workers", label: "Workers", href: "/workers", permission: "worker:read", phase: 3 },
  { key: "tasks", label: "Tasks & Rates", href: "/tasks", permission: "work:read", phase: 3 },
  { key: "attendance", label: "Attendance", href: "/attendance", permission: "attendance:read", phase: 3 },
  { key: "work-entry", label: "Daily Work Entry", href: "/work-entry", permission: "work:read", phase: 3 },
  { key: "allowances", label: "Daily Allowances", href: "/allowances", permission: "work:read", phase: 3 },
  { key: "salary", label: "Salary Management", href: "/salary", permission: "settlement:read", phase: 4 },
  { key: "advances", label: "Advances", href: "/advances", permission: "advance:read", phase: 4 },
  { key: "reports", label: "Reports", href: "/reports", permission: "report:read", phase: 5 },
];
