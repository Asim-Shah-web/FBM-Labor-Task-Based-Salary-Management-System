# Operations guide: backups, checks, and incidents

## 1. Backups

Wages and advances cannot be recreated from memory, so backups matter more than any feature.

```bash
npm run db:backup                 # creates backups/fbm-YYYYMMDD-HHMMSS.dump, verifies it, keeps the newest 30
```

- The script uses `pg_dump` if installed, otherwise runs it inside the Docker `db` container. Force a mode with
  `npm run db:backup -- --docker` or `-- --local`.
- Settings (environment variables): `BACKUP_DIR` (default `backups`), `BACKUP_KEEP` (default 30).
- A backup is only counted as successful when the file can be read back; failed backups are deleted and the command exits with an error.

### Schedule it

**Linux / macOS (cron, every night at 02:00):**
```cron
0 2 * * * cd /path/to/fbm && /usr/bin/npm run db:backup >> backups/backup.log 2>&1
```

**Windows (Task Scheduler):** create a daily task that runs `npm run db:backup` with "Start in" set to the project folder.

### Copy backups OFF the machine

A backup on the same disk as the database does not survive a disk failure, theft, or fire. At least weekly, copy the
`backups/` folder to another place: an external drive kept elsewhere, another computer, or cloud storage
(for example `rclone copy backups remote:fbm-backups`). Treat backup files as confidential: they contain wage data and password hashes.

## 2. Restore drill (do this once now, then every quarter)

A backup you have never restored is only a hope.

```bash
# 1. Restore into a SEPARATE database. Your live data is not touched.
npm run db:restore -- backups/fbm-20261107-020000.dump

# 2. The script prints row counts. Compare them with what you expect.
# 3. Optionally run the integrity check against the restored copy:
#    set DATABASE_URL to .../fbm_restore_test and run:  npm run db:reconcile
```

### Disaster recovery (live database lost or corrupted)

1. **Stop the application.**
2. `npm run db:restore -- backups/<chosen file>.dump --live --confirm=OVERWRITE`
3. Start the application and run `npm run db:reconcile`.
4. Work done after the backup time must be re-entered; check the Audit Log of the old database if it is still readable.

## 3. Integrity check

```bash
npm run db:reconcile              # exit code 0 = consistent, 1 = problem found
```

The same check is available in the app under **Audit Log > Financial integrity check**. It recomputes every earning's
settled amount, every advance's recovered amount, and every payment's totals from the permanent history rows and compares
them with the stored values. Run it after every restore and about weekly.

**If a check fails:** do not edit data by hand. Stop entering payments, take a backup of the current state, and keep the
output (it lists the affected record IDs). Compare with the Audit Log to see what happened. The usual causes are a manual
database edit or a bug; send the output and the Audit Log entries for those IDs to the developer.

## 4. Monitoring

- `GET /api/health` returns `{"status":"ok"}` (HTTP 200) when the app can reach the database, otherwise HTTP 503.
  Point an uptime monitor (UptimeRobot, Better Stack, a cron `curl`) at it.
- Application errors are written as JSON lines to the process output (`level`, `message`, `time`). Keep them
  (Docker: `docker compose logs`; or redirect to a file) and watch for `"level":"error"`.

## 5. Common incidents

| Situation | What to do |
|---|---|
| Manager locked out after failed logins | Wait 15 minutes, or clear the lock (README, Troubleshooting) |
| Forgot the manager password | Delete the user row and run `npm run db:seed` (README, Troubleshooting) |
| Entered a wrong payment | Open the receipt, **Reverse** with a reason, record the correct payment |
| Need to correct an entry that was already paid | Reverse that settlement first, correct the entry, then settle again |
| "Something went wrong" page | Note the Reference code, check the server log for the same time, then retry |
| Suspect someone else used the account | Change the password (this signs out every session), review the Audit Log for unknown actions and `auth.login` entries |
| Disk full or database will not start | Free space, restart the database, run `npm run db:reconcile` |

## 6. Upgrading the application

1. Take a backup (`npm run db:backup`).
2. Pull the new code, then `npm install`.
3. `npm run db:deploy` (applies new migrations), then `npm run build` and restart.
4. Run `npm test`, `npm run db:reconcile`, and open the dashboard.
