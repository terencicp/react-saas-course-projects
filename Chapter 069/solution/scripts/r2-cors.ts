import { pathToFileURL } from 'node:url';

import { GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { BUCKET, r2 } from '@/lib/r2';

// Push the bucket CORS rule the browser PUT needs. The student runs this once against
// THEIR OWN R2 bucket (`pnpm r2:cors`) — it is NEVER run in the render pipeline (no
// live bucket there). Idempotent: a re-run overwrites with the same rule.
//
// AllowedOrigins is the app origin (NEXT_PUBLIC_APP_URL) so a copied URL from another
// origin is rejected by the browser preflight. AllowedHeaders is content-type only —
// the signed URL carries content-length;content-type;host, and the XHR PUT sends just
// Content-Type. ExposeHeaders surfaces the etag so the client could read it back.
export const putCors = async (): Promise<void> => {
  await r2.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [env.NEXT_PUBLIC_APP_URL],
            AllowedMethods: ['GET', 'PUT'],
            AllowedHeaders: ['content-type'],
            ExposeHeaders: ['etag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  const effective = await r2.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.info(
    '[r2:cors] effective rules:',
    JSON.stringify(effective.CORSRules, null, 2),
  );
};

// pathToFileURL normalizes the entry path so the guard fires even when the project
// path contains a space (import.meta.url percent-encodes it while process.argv[1]
// keeps it literal — a naive compare would silently skip).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  putCors()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
