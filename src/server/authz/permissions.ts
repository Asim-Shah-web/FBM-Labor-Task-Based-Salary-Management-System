// Single source of truth for permission codes and the default role map.
// The seed script writes these into the roles / permissions tables.

export const PERMISSIONS = {
  "worker:read": "View workers",
  "worker:write": "Create and edit workers",
  "task:write": "Create and edit tasks",
  "rate:change": "Change task rates",
  "attendance:read": "View attendance",
  "attendance:write": "Enter and correct attendance",
  "work:read": "View daily work entries",
  "work:write": "Enter, approve and void daily work entries",
  "allowance:write": "Enter, approve and void daily allowances",
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
  "user:manage": "Manage users and roles",
  "settings:manage": "Manage system settings",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const ROLE_NAMES = ["ADMIN", "MANAGER", "VIEWER"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

const MANAGER: PermissionCode[] = ALL_PERMISSIONS.filter(
  (p) => p !== "user:manage" && p !== "settings:manage",
);

const VIEWER: PermissionCode[] = [
  "worker:read",
  "attendance:read",
  "work:read",
  "settlement:read",
  "advance:read",
  "report:read",
  "report:export",
];

export const ROLE_PERMISSIONS: Record<RoleName, PermissionCode[]> = {
  ADMIN: ALL_PERMISSIONS, // Admin = Manager + user/settings management
  MANAGER,
  VIEWER,
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  ADMIN: "Full access including user and settings management",
  MANAGER: "Runs daily operations: workers, work entry, attendance, salary, advances, reports",
  VIEWER: "Read-only access to records and reports",
};
