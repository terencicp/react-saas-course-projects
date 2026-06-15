import { pathToFileURL } from 'node:url';

// The by-hand backfill runner (run via `pnpm db:backfill`, never imported by the
// app, never inside a request). At the baseline it is inert — there is no
// subtotal/tax column to fill yet.
// TODO(L4) — bounded-batched-idempotent backfill: select 1000 WHERE subtotal IS NULL; set subtotal=total, tax=0; loop; run on dbUnpooled
export const runBackfill = async (): Promise<void> => {
  console.log('[backfill] not implemented');
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
