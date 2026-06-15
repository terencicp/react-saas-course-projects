import { pathToFileURL } from 'node:url';

import { reset } from 'drizzle-seed';

import { dbUnpooled } from '@/db/index';
import { emailSuppressions } from '@/db/schema';

// A minimal deterministic seed: clear the suppression list and insert NO rows —
// users arrive through sign-up, not the seed. To exercise the resend escape-hatch
// (a suppressed recipient still letting verification through under the manual
// carve-out), insert one row here by hand (see README).
export const runSeed = async (): Promise<void> => {
  await reset(dbUnpooled, { emailSuppressions });
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
