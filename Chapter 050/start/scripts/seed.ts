import { pathToFileURL } from 'node:url';

import { reset } from 'drizzle-seed';

import { dbUnpooled } from '@/db/index';
import { emailSuppressions, organizations, users } from '@/db/schema';

// A small deterministic seed: one org, one user (the auth-stub resolves these by
// natural key), and one pre-suppressed address so the inspector's suppression
// path is exercisable out of the box. reset()-then-insert keeps it idempotent.
//
// The suppressed address is a PLACEHOLDER — replace it with
// `suppressed@send.<your-domain>` (see README) before running `pnpm db:seed`,
// so a real send against your verified domain still short-circuits at the gate.
export const runSeed = async (): Promise<void> => {
  await reset(dbUnpooled, { organizations, users, emailSuppressions });

  await dbUnpooled.insert(organizations).values({ name: 'Acme', slug: 'acme' });

  await dbUnpooled
    .insert(users)
    .values({ name: 'Ada Lovelace', email: 'ada@acme.test' });

  await dbUnpooled
    .insert(emailSuppressions)
    .values({ email: 'suppressed@send.acme.example', reason: 'complaint' });
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
