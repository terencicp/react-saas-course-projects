import { pathToFileURL } from 'node:url';

import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';

import { BUCKET, r2 } from '@/lib/r2';

// Push the 7-day expiry rule for export artifacts. The student runs this once against
// THEIR OWN bucket (`pnpm r2:lifecycle`) — NEVER in the render pipeline. Idempotent:
// a re-run overwrites with the same single-rule config.
//
// The rule is scoped to the leading `exports/` prefix — R2 prefix matching is a literal
// string prefix, not a glob, so this expires only the throwaway export CSVs (keyed
// `exports/org/<orgId>/<runId>.csv`) and never touches user uploads, which live under the
// `org/` prefix instead. User uploads are long-lived and carry a file_metadata row;
// exports are single-consumer artifacts with no row, swept by this rule alone.
export const putLifecycle = async (): Promise<void> => {
  await r2.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: BUCKET,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'expire-exports-after-7-days',
            Status: 'Enabled',
            Filter: { Prefix: 'exports/' },
            Expiration: { Days: 7 },
          },
        ],
      },
    }),
  );

  const effective = await r2.send(
    new GetBucketLifecycleConfigurationCommand({ Bucket: BUCKET }),
  );
  console.info(
    '[r2:lifecycle] effective rules:',
    JSON.stringify(effective.Rules, null, 2),
  );
};

// pathToFileURL normalizes the entry path so the guard fires even when the project
// path contains a space (import.meta.url percent-encodes it while process.argv[1]
// keeps it literal — a naive compare would silently skip).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  putLifecycle()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
