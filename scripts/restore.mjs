// Restore a backup.
//
//   SAFE (default): restore into a SEPARATE database to check the backup works. Your live data is not touched.
//     npm run db:restore -- backups/fbm-20261107-120000.dump
//     npm run db:restore -- backups/fbm-20261107-120000.dump --target=fbm_restore_test
//
//   LIVE (disaster recovery): overwrite the live database. STOP THE APP FIRST.
//     npm run db:restore -- backups/fbm-....dump --live --confirm=OVERWRITE
//
// Add --docker or --local to force how the PostgreSQL tools are run.
import { spawnSync } from "node:child_process";
import { existsSync, openSync, closeSync } from "node:fs";
import { DB_NAME_RE, dbInfo, fail, loadEnv, useDocker } from "./lib-db.mjs";

loadEnv();
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file || !existsSync(file)) fail("Give the path of an existing .dump file. Example: npm run db:restore -- backups/fbm-20261107-120000.dump");

const info = dbInfo();
const live = args.includes("--live");
if (live && !args.includes("--confirm=OVERWRITE")) fail("Restoring over the LIVE database needs --confirm=OVERWRITE. Stop the application first.");
const target = live ? info.db : (args.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "fbm_restore_test");
if (!DB_NAME_RE.test(target)) fail("Invalid database name (letters, numbers and underscores only).");
if (!live && target === info.db) fail("The target is the live database. Use --live --confirm=OVERWRITE if that is really what you want.");

const docker = useDocker(args);
const dc = ["compose", "exec", "-T", "db"];
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { stdio: ["ignore", "inherit", "inherit"], ...opts });
const psql = (sql, db = "postgres") => docker
  ? run("docker", [...dc, "psql", "-U", info.user, "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql])
  : run("psql", [info.urlFor(db), "-v", "ON_ERROR_STOP=1", "-c", sql]);

console.log(`${live ? "LIVE RESTORE into" : "Test restore into"} database "${target}" from ${file} ...`);
if (live) {
  // Disconnect anyone still connected, then recreate empty.
  psql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target}' AND pid <> pg_backend_pid()`);
}
if (psql(`DROP DATABASE IF EXISTS "${target}"`).status !== 0) fail("Could not drop the target database (is something still connected?).");
if (psql(`CREATE DATABASE "${target}"`).status !== 0) fail("Could not create the target database.");

const input = openSync(file, "r");
const restore = docker
  ? spawnSync("docker", [...dc, "pg_restore", "--no-owner", "-U", info.user, "-d", target], { stdio: [input, "inherit", "inherit"] })
  : spawnSync("pg_restore", ["--no-owner", `--dbname=${info.urlFor(target)}`, file], { stdio: ["ignore", "inherit", "inherit"] });
closeSync(input);
if (restore.status !== 0) fail("pg_restore reported errors. Review the messages above.");

console.log("\nRow counts in the restored database:");
psql(`SELECT 'workers' AS table, count(*) FROM workers UNION ALL SELECT 'earnings', count(*) FROM earnings UNION ALL SELECT 'salary_payments', count(*) FROM salary_payments UNION ALL SELECT 'advances', count(*) FROM advances UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs`, target);
console.log(live
  ? "\nLive database restored. Start the app, then run:  npm run db:reconcile"
  : `\nBackup is restorable. To inspect it, point DATABASE_URL at "${target}", then run:  npm run db:reconcile\nDrop the test database when finished.`);
