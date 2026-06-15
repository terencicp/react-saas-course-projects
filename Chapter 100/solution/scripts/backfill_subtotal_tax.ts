import { pathToFileURL } from 'node:url';

import { sql } from 'drizzle-orm';

import { dbUnpooled } from '@/db/index';

// The by-hand backfill runner (run via `pnpm db:backfill`, never imported by the
// app, never inside a request). It runs on dbUnpooled — the direct connection a
// long-running script wants, not the pooler's transaction mode.
//
// Bounded + idempotent: each iteration selects up to 1000 ids WHERE subtotal IS
// NULL, then sets subtotal = total, tax = '0' for that batch — re-guarded on
// subtotal IS NULL so a concurrent dual-write or a re-run writes zero rows. Loops
// until a pass touches no rows. Run AFTER the dual-write is live so no row slips
// through the gap.
const BATCH_SIZE = 1000;

export const runBackfill = async (): Promise<void> => {
  let totalUpdated = 0;

  while (true) {
    const ids = await dbUnpooled.execute<{ id: string }>(sql`
      select id::text as id
      from invoices
      where subtotal is null
      limit ${BATCH_SIZE}
    `);

    const batch = Array.from(ids).map((row) => row.id);
    if (batch.length === 0) {
      break;
    }

    const updated = await dbUnpooled.execute<{ id: string }>(sql`
      update invoices
      set subtotal = total, tax = '0'
      where id = any(${batch}::uuid[]) and subtotal is null
      returning id::text as id
    `);

    totalUpdated += Array.from(updated).length;
    console.log(`[backfill] updated ${totalUpdated} rows so far`);
  }

  console.log(`[backfill] done — ${totalUpdated} rows backfilled`);
};

// Run as a CLI: pathToFileURL normalizes the entry path so the guard fires even
// when the project path contains a space.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runBackfill()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
