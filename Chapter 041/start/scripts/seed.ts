import { pathToFileURL } from 'node:url';

import { reset } from 'drizzle-seed';

import { dbUnpooled } from '@/db/index';
import * as schema from '@/db/schema';

export const runSeed = async (): Promise<void> => {
  // TODO(L4) — reset(dbUnpooled, schema) then direct-insert 2 orgs / 4 users / 5 org_members (user 1 in both orgs) / 40 customers with 12-18 invoices each (weighted statuses) / 2-4 lines each (sequential position); deterministic via a SEED-driven PRNG, PKs left to the schema uuidv7() default.
  await reset(dbUnpooled, schema);
};

// Run as a CLI: pathToFileURL normalizes the entry path so the guard fires even
// when the project path contains a space (import.meta.url percent-encodes it
// while process.argv[1] keeps it literal — a naive compare would silently skip).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runSeed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
