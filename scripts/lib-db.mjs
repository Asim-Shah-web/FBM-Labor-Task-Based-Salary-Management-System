// Shared helpers for the backup / restore scripts (no dependencies).
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function loadEnv() {
  if (existsSync(".env")) {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      const v = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (put it in .env or the environment).");
}

export function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

/** DATABASE_URL without Prisma-only query params (libpq rejects `?schema=public`). */
export function dbInfo() {
  const u = new URL(process.env.DATABASE_URL);
  const info = { user: decodeURIComponent(u.username), db: u.pathname.slice(1), host: u.hostname, port: u.port || "5432" };
  u.search = "";
  info.baseUrl = u.toString();
  info.urlFor = (dbName) => { const c = new URL(u); c.pathname = `/${dbName}`; return c.toString(); };
  return info;
}

export const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;

/** Docker mode: run the PostgreSQL client tools inside the compose `db` container. */
export const useDocker = (args) =>
  args.includes("--docker") || process.env.BACKUP_MODE === "docker" || (!args.includes("--local") && !has("pg_dump"));

export const DB_NAME_RE = /^[A-Za-z0-9_]{1,63}$/;
