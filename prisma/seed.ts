/* Seeds the permission catalogue, the single MANAGER role and the manager account.
 * Safe to re-run:
 *  - permissions/roles are synced to src/server/authz/permissions.ts
 *  - the manager user is created only if missing (an existing password is never overwritten)
 *  - leftover roles from earlier phases (ADMIN, VIEWER) are folded into MANAGER / deactivated
 */
import { PrismaClient } from "@prisma/client";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_NAMES, ROLE_PERMISSIONS } from "../src/server/authz/permissions";
import { checkPasswordPolicy, hashPassword } from "../src/server/auth/password";

const prisma = new PrismaClient();

async function syncRbac() {
  // Remove permission codes that no longer exist
  await prisma.permission.deleteMany({ where: { code: { notIn: ALL_PERMISSIONS } } });
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSIONS[code] },
      create: { code, description: PERMISSIONS[code] },
    });
  }
  const byCode = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  for (const name of ROLE_NAMES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name], isSystem: true },
      create: { name, description: ROLE_DESCRIPTIONS[name], isSystem: true },
    });
    const wanted = new Set(ROLE_PERMISSIONS[name].map((c) => byCode.get(c)!));
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: [...wanted] } } });
    await prisma.rolePermission.createMany({
      data: [...wanted].map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}

/** Phase 2 seeded ADMIN and VIEWER roles. FBM now has a single manager role. */
async function retireLegacyRoles() {
  const manager = await prisma.role.findUniqueOrThrow({ where: { name: "MANAGER" } });
  const legacy = await prisma.role.findMany({ where: { name: { notIn: [...ROLE_NAMES] } }, include: { users: true } });
  for (const role of legacy) {
    for (const ur of role.users) {
      if (role.name === "VIEWER") {
        await prisma.user.update({ where: { id: ur.userId }, data: { isActive: false, sessionVersion: { increment: 1 } } });
        console.log(`  deactivated legacy viewer account (user id ${ur.userId})`);
      } else {
        await prisma.userRole.createMany({ data: [{ userId: ur.userId, roleId: manager.id }], skipDuplicates: true });
        console.log(`  moved legacy ${role.name} account (user id ${ur.userId}) to MANAGER: delete it if unused`);
      }
    }
    await prisma.userRole.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
  }
}

async function ensureManager() {
  const username = (process.env.SEED_MANAGER_USERNAME ?? "manager").trim().toLowerCase();
  const password = process.env.SEED_MANAGER_PASSWORD ?? "";
  const fullName = process.env.SEED_MANAGER_NAME?.trim() || "Manager";

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`  manager "${username}" already exists: left unchanged`);
    return;
  }
  const policy = checkPasswordPolicy(password, username);
  if (!policy.ok) throw new Error(`SEED_MANAGER_PASSWORD rejected: ${policy.message}`);
  if (process.env.NODE_ENV === "production" && /changeme/i.test(password))
    throw new Error("Refusing to seed the manager with a placeholder password in production.");

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "MANAGER" } });
  await prisma.user.create({
    data: {
      username,
      fullName,
      passwordHash: await hashPassword(password),
      mustChangePassword: true, // forced change at first login
      roles: { create: { roleId: role.id } },
    },
  });
  console.log(`  created manager "${username}" (must change password at first login)`);
}

async function main() {
  console.log("Syncing roles and permissions...");
  await syncRbac();
  await retireLegacyRoles();
  console.log("Ensuring the manager account...");
  await ensureManager();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
