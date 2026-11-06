// Single source of truth for permission codes and the role map.
// FBM has ONE role: the Manager is the administrator and runs the whole system.
// Permissions are still checked server-side on every action so the model can grow later.

export const PERMISSIONS = {
  "worker:read": "View workers",
  "worker:write": "Create and edit workers",
  "task:write": "Create and edit tasks",
  "rate:change": "Change task rates",
  "attendance:read": "View attendance",
  "attendance:write": "Enter and correct attendance",
  "work:read": "View daily work entries and tasks",
  "work:write": "Enter, approve, correct and void daily work entries",
  "allowance:write": "Enter, correct and void daily allowances",
  "settlement:read": "View salary settlements and balances",
  "settlement:create": "Post salary settlements",
  "settlement:reverse": "Reverse salary settlements",
  "advance:read": "View advances",
  "advance:issue": "Issue advances",
  "advance:recover": "Recover advances during a settlement",
  "advance:void": "Void advances",
  "report:read": "View reports and dashboard",
  "report:export": "Export and print reports",
  "audit:read": "View audit log",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const ROLE_NAMES = ["MANAGER"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_PERMISSIONS: Record<RoleName, PermissionCode[]> = {
  MANAGER: ALL_PERMISSIONS,
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  MANAGER: "Administrator. Runs the whole system: workers, work, attendance, salary, advances, reports",
};
