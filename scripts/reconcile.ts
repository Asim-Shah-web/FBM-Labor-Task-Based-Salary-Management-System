/* Run the ledger integrity checks from the command line:  npm run db:reconcile
 * Exit code 0 = everything consistent, 1 = at least one check failed (suitable for cron/monitoring). */
import { runIntegrityChecks } from "../src/server/services/reconcile.service";
import { prisma } from "../src/server/db/prisma";

async function main() {
  const results = await runIntegrityChecks();
  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.ok ? "" : ` (${r.count} problem${r.count === 1 ? "" : "s"})`}`);
    for (const s of r.sample) console.log(`       ${s}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED. Do not ignore this: see docs/03-operations.md.`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
