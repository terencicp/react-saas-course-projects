import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

import { env } from '@/env';

// The single R2 client for the app, S3-compatible. One client powers both consumers:
// the browser-PUT user uploads (presignedPut signs a direct-to-R2 URL) and the
// server-PUT export retrofit (the worker, holding the CSV in memory, PUTs directly).
// `server-only` is the poison pill — importing this into a Client Component is a build
// error, so the credentials can never reach the browser.
//
// `region: 'auto'` is mandatory: R2 ignores the value but the AWS SigV4 signer requires
// one. The endpoint is the account-scoped R2 host derived from R2_ACCOUNT_ID — the SDK
// then signs virtual-hosted URLs (`<bucket>.<account>.r2.cloudflarestorage.com`), the
// form R2 expects; do not force path-style.
//
// `requestChecksumCalculation` / `responseChecksumValidation` set to 'WHEN_REQUIRED'
// are ALSO mandatory. @aws-sdk/client-s3 ≥3.729 defaults to 'WHEN_SUPPORTED', which
// bakes `x-amz-checksum-crc32` + `x-amz-sdk-checksum-algorithm=CRC32` into the signed
// PUT URL (and `x-amz-checksum-mode=ENABLED` into the GET). R2 does not implement CRC32,
// and the browser XHR PUT sends only Content-Type — so the upload 400s/SignatureDoesNotMatch
// without these flags. With them, the signed URL carries only content-length;content-type;host.
export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

// The one bucket per environment, not a separate bucket per workload. User uploads live
// under `org/<orgId>/files/…` (tenant-partitioned, each backed by a file_metadata row);
// export CSVs live under a leading `exports/…` prefix (throwaway, no row, swept by the
// 7-day lifecycle rule that targets exactly that prefix).
export const BUCKET = env.R2_BUCKET_NAME;

// The closed set of accepted upload content types. The client pre-checks against it for
// instant feedback; the action re-validates via z.enum(ALLOWED_CONTENT_TYPES) — the
// server boundary is the real gate.
export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/csv',
] as const;

// The single-PUT size cap. 25 MB — past this the upload would need multipart, a
// named-not-built scope cut. The signed ContentLength documents intent; the
// post-upload HEAD is the real boundary (R2 does not enforce the signed length).
export const MAX_BYTES = 25 * 1024 * 1024;
