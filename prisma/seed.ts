/* Seeds permissions, roles and the first users. Safe to re-run:
 *  - permissions/roles are synced to src/server/authz/permissions.ts
 *  - users are created only if missing (existing passwords are never overwritten)
 */
import { PrismaClient } from "@prisma/client";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_NAMES, ROLE_PERMISSIONS } from "../src/server/authz/permissions";
import { checkPasswordPolicy, hashPassword } from "../src/server/auth/password";

const prisma = new PrismaClient();

async function syncRbac() {
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSIONS[code] },
      create: { code, description: PERMISSIONS[code] },
    });
  }
  const allPerms = await prisma.permission.findMany();
  const byCode = new Map(allPerms.map((p) => [p.code, p.id]));

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

async function ensureUser(opts: { username: string; password: string; fullName: string; role: (typeof ROLE_NAMES)[number] }) {
  const username = opts.username.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`  user "${username}" already exists: left unchanged`);
    return;
  }
  const policy = checkPasswordPolicy(opts.password, username);
  if (!policy.ok) throw new Error(`Seed password for "${username}" rejected: ${policy.message}`);
  if (process.env.NODE_ENV === "production" && /changeme/i.test(opts.password))
    throw new Error(`Refusing to seed "${username}" with a placeholder password in production.`);

  const role = await prisma.role.findUniqueOrThrow({ where: { name: opts.role } });
  await prisma.user.create({
    data: {
      username,
      fullName: opts.fullName,
      passwordHash: await hashPassword(opts.password),
      mustChangePassword: true, // forced change at first login
      roles: { create: { roleId: role.id } },
    },
  });
  console.log(`  created ${opts.role} user "${username}" (must change password at first login)`);
}

async function main() {
  console.log("Syncing roles and permissions...");
  await syncRbac();

  console.log("Ensuring initial users...");
  const env = process.env;
  await ensureUser({
    username: env.SEED_ADMIN_USERNAME ?? "admin",
    password: env.SEED_ADMIN_PASSWORD ?? "",
    fullName: "Administrator",
    role: "ADMIN",
  });
  await ensureUser({
    username: env.SEED_MANAGER_USERNAME ?? "manager",
    password: env.SEED_MANAGER_PASSWORD ?? "",
    fullName: "Manager",
    role: "MANAGER",
  });
  if (env.SEED_VIEWER_PASSWORD) {
    await ensureUser({
      username: env.SEED_VIEWER_USERNAME ?? "viewer",
      password: env.SEED_VIEWER_PASSWORD,
      fullName: "Viewer",
      role: "VIEWER",
    });
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
