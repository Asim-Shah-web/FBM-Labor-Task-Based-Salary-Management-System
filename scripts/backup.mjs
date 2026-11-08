// Database backup:  npm run db:backup   (add -- --docker or -- --local to force a mode)
//
//  * Creates backups/fbm-YYYYMMDD-HHMMSS.dump  (PostgreSQL custom format, compressed)
//  * Verifies the file can be read back (pg_restore --list)
//  * Deletes old backups beyond BACKUP_KEEP (default 30)
// Copy the backups/ folder OFF this machine regularly (see docs/03-operations.md).
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync, openSync, closeSync, readFileSync } from "node:fs";
import path from "node:path";
import { dbInfo, fail, loadEnv, useDocker } from "./lib-db.mjs";

loadEnv();
const args = process.argv.slice(2);
const info = dbInfo();
const dir = process.env.BACKUP_DIR || "backups";
const keep = Number(process.env.BACKUP_KEEP || 30);
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const file = path.join(dir, `fbm-${stamp}.dump`);
const docker = useDocker(args);
console.log(`Backing up database "${info.db}" using ${docker ? "docker compose (db service)" : "local pg_dump"} ...`);

const out = openSync(file, "w");
const dump = docker
  ? spawnSync("docker", ["compose", "exec", "-T", "db", "pg_dump", "-U", info.user, "-d", info.db, "-Fc", "--no-owner"], { stdio: ["ignore", out, "inherit"] })
  : spawnSync("pg_dump", ["--format=custom", "--no-owner", `--dbname=${info.baseUrl}`], { stdio: ["ignore", out, "inherit"], env: process.env });
closeSync(out);
if (dump.status !== 0) { try { unlinkSync(file); } catch {} fail("pg_dump failed (is the database running and the credentials correct?). No backup was written."); }

const size = statSync(file).size;
if (size < 1024) { unlinkSync(file); fail(`The backup is suspiciously small (${size} bytes). It was deleted.`); }

// Verify the archive is readable.
const verify = docker
  ? spawnSync("docker", ["compose", "exec", "-T", "db", "pg_restore", "--list"], { input: readFileSync(file), stdio: ["pipe", "ignore", "inherit"], maxBuffer: 1 << 30 })
  : spawnSync("pg_restore", ["--list", file], { stdio: ["ignore", "ignore", "inherit"] });
if (verify.status !== 0) fail(`The backup was written to ${file} but could not be read back. Do not rely on it.`);

console.log(`OK  ${file}  (${(size / 1024).toFixed(0)} KB, verified readable)`);

const all = readdirSync(dir).filter((f) => /^fbm-\d{8}-\d{6}\.dump$/.test(f)).sort();
for (const old of all.slice(0, Math.max(0, all.length - keep))) { unlinkSync(path.join(dir, old)); console.log(`removed old backup ${old}`); }
console.log(`${Math.min(all.length, keep)} backup(s) kept in ${dir}/`);
