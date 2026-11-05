// One-time database initialisation:
//   1. asks Prisma to generate the init migration SQL from schema.prisma (no apply yet)
//   2. appends prisma/sql/financial_constraints.sql to that migration
//   3. applies it with `prisma migrate deploy`
// Requires DATABASE_URL (in .env) and a running Postgres (npm run db:up).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const run = (args) => {
  const r = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const migrationsDir = path.join("prisma", "migrations");
if (existsSync(migrationsDir) && readdirSync(migrationsDir).some((d) => d !== "migration_lock.toml")) {
  console.error("prisma/migrations already exists. init-db only runs on a fresh project.\nUse `npm run db:deploy` to apply existing migrations.");
  process.exit(1);
}

run(["prisma", "migrate", "dev", "--create-only", "--name", "init_with_financial_constraints"]);

const created = readdirSync(migrationsDir).filter((d) => d.endsWith("_init_with_financial_constraints"));
if (created.length !== 1) {
  console.error("Could not locate the generated migration folder.");
  process.exit(1);
}
const file = path.join(migrationsDir, created[0], "migration.sql");
const sql = readFileSync(path.join("prisma", "sql", "financial_constraints.sql"), "utf8");
appendFileSync(file, "\n\n" + sql);
console.log(`Appended financial constraints to ${file}`);

run(["prisma", "migrate", "deploy"]);
console.log("Database initialised.");
