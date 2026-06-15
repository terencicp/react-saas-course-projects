import { existsSync, readFileSync } from 'node:fs';
import { uuidv7 } from 'uuidv7';
import { describe, expect, it } from 'vitest';

import { buildObjectKey, extFor } from '@/lib/files/keys';

// Lesson 2 — Sign the PUT, no DB write.
//
// What the runner can and cannot reach. presignedPut signs a live R2 URL and runs
// behind authedAction → requireOrgUser (a session + DB the runner has neither of),
// and its module pulls `server-only` + the env boundary, so importing the action at
// runtime throws. The bytes never touch the function and there is no bucket here.
//
// So the observables are proven two ways, never by live execution:
//   • the object key the action returns is reproduced through the pure
//     buildObjectKey / extFor seam (real execution, no R2, no DB);
//   • the R2-signing shape and the "no DB write" invariant are read off the action's
//     own source — the only place those facts are observable in a node, no-DOM run.
// Helpers are inlined; this file imports only vitest, node built-ins, and the
// student's own public modules.

// The allowlist + cap live in `@/lib/r2`, but that module imports `server-only` and
// throws at import time outside a Server Component — so the policy is read off its
// source as literals (the runner cannot import it). Bases are kept URLs so a path with
// a space ("Chapter 069") survives — a bare string is not a valid `new URL()` base.
//
// Anchor reads to the project root (the dir holding package.json), found by walking up
// from this file — so the same file works whether it runs from lesson-verification/ or
// the runner's tests/lessons/ copy.
const projectRoot = (() => {
  let dir = new URL('./', import.meta.url);
  for (let i = 0; i < 8; i++) {
    if (existsSync(new URL('package.json', dir))) return dir;
    dir = new URL('../', dir);
  }
  throw new Error(
    'could not locate project root (no package.json found upward)',
  );
})();

const readSource = (relFromRoot: string) =>
  readFileSync(new URL(relFromRoot, projectRoot), 'utf8');

const actionSource = readSource('src/lib/files/presigned-put.ts');
const r2Source = readSource('src/lib/r2.ts');

// The closed content-type set, parsed out of the ALLOWED_CONTENT_TYPES array literal
// in r2.ts (only the strings inside its brackets, so the endpoint host is never caught).
const allowlistBlock =
  r2Source.match(/ALLOWED_CONTENT_TYPES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
const ALLOWED_CONTENT_TYPES = [...allowlistBlock.matchAll(/'([^']+)'/g)].map(
  (m) => m[1],
);

// The single-PUT cap (25 MB), read off its declaration.
const MAX_BYTES = (() => {
  const expr = r2Source.match(/MAX_BYTES\s*=\s*([0-9*\s]+)/)?.[1] ?? '0';
  return expr
    .split('*')
    .map((n) => Number(n.trim()))
    .reduce((a, b) => a * b, 1);
})();

// Strip line comments and block comments so prose in the file (which mentions "db",
// "row", etc.) never trips a source-shape assertion — only real code is inspected.
const actionCode = actionSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// A v7 UUID: version nibble 7, variant bits 10xx. uploadId must look like this so the
// key is sortable-by-time and never a client-chosen value.
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Lesson 2 — presignedPut signs a 5-min PUT and writes no DB row', () => {
  // Requirement 1 — a valid call returns a signed R2 URL plus a server-generated
  // upload id and object key, and writes no database row.
  describe('valid upload request → signed URL + server-built id/key, no row', () => {
    it('builds the object key from the org + a server-generated v7 id, never a client value', () => {
      // The action returns exactly this key; the lesson's point is that it is
      // server-constructed, so we reproduce it through the same pure seam.
      const orgId = 'org_acme';
      const uploadId = uuidv7();

      expect(
        uploadId,
        'uploadId must be a server-generated UUIDv7 — a client-chosen id is the tenancy-bypass shape',
      ).toMatch(UUID_V7);

      const key = buildObjectKey({
        orgId,
        fileId: uploadId,
        contentType: 'image/jpeg',
      });

      expect(
        key,
        'objectKey must be org/<orgId>/files/<uploadId>.<ext> — built server-side, never from the client filename',
      ).toBe(`org/${orgId}/files/${uploadId}.jpg`);
    });

    it('derives the extension from the validated content type (jpeg → jpg)', () => {
      // The curl checklist and the returned key only line up if the ext map matches.
      expect(
        extFor('image/jpeg'),
        'image/jpeg must map to the "jpg" extension (not "jpeg") so the object key matches the hand-check',
      ).toBe('jpg');
      expect(extFor('application/pdf')).toBe('pdf');
    });

    it('signs a PutObjectCommand and returns { uploadId, url, objectKey }', () => {
      expect(
        /getSignedUrl\s*\(/.test(actionCode),
        'the action must sign the URL with getSignedUrl — the browser PUTs straight to the returned URL',
      ).toBe(true);
      expect(
        /new\s+PutObjectCommand\s*\(/.test(actionCode),
        'sign a PutObjectCommand (an upload capability) — not a GetObjectCommand',
      ).toBe(true);
      for (const field of ['uploadId', 'url', 'objectKey']) {
        expect(
          new RegExp(`\\bok\\s*\\([\\s\\S]*\\b${field}\\b`).test(actionCode),
          `the success Result must return ${field} so the browser can PUT then finalize`,
        ).toBe(true);
      }
    });

    it('writes no database row — the row belongs to finalizeUpload, after the bytes land', () => {
      expect(
        /\binsert\s*\(/.test(actionCode),
        'presignedPut must not insert a row — a never-completed upload would leave an orphan row that lies in the UI',
      ).toBe(false);
      expect(
        /\b(tenantDb|ctx\.db)\b/.test(actionCode),
        'presignedPut must not touch the database — no row until the upload is confirmed in finalizeUpload',
      ).toBe(false);
    });

    it('signs a virtual-hosted R2 PUT bound to the content type and time-boxed to 5 minutes', () => {
      expect(
        /signableHeaders[\s\S]*content-type/.test(actionCode),
        'sign with signableHeaders content-type so the URL is bound to the content type (a mismatched PUT trips 403 SignatureDoesNotMatch)',
      ).toBe(true);
      expect(
        /expiresIn\s*:\s*300\b/.test(actionCode),
        'the signed URL must expire in 300s (5 min) — long enough for 25 MB on a slow link, short enough that a leaked URL grants no lasting write',
      ).toBe(true);
      expect(
        /ContentType\s*:/.test(actionCode),
        'pass the claimed ContentType into the PutObjectCommand so the signature is bound to it',
      ).toBe(true);
    });
  });

  // Requirement 2 — a disallowed content type is rejected with `validation` and
  // triggers no R2 call. The rejection lives at the Zod boundary (z.enum over the
  // shared allowlist), which authedAction runs before the action body, so the lone
  // getSignedUrl call never executes.
  describe('disallowed content type → validation, no R2 call', () => {
    it('pins the content type to the shared ALLOWED_CONTENT_TYPES allowlist', () => {
      // One source of truth for the policy: the schema enumerates the shared list.
      expect(
        /z\.enum\s*\(\s*ALLOWED_CONTENT_TYPES\s*\)/.test(actionCode),
        'validate contentType with z.enum(ALLOWED_CONTENT_TYPES) — one allowlist, reused at the Zod boundary',
      ).toBe(true);
    });

    it('the allowlist excludes non-image/pdf/csv types, so the boundary rejects them', () => {
      // A disallowed type is not in the closed set, so z.enum(ALLOWED_CONTENT_TYPES)
      // fails to parse → authedAction returns `validation` before fn runs → no sign.
      // Sanity-check the parse first, then assert the exclusions.
      expect(
        ALLOWED_CONTENT_TYPES.length,
        'expected to find the ALLOWED_CONTENT_TYPES allowlist in lib/r2.ts',
      ).toBeGreaterThanOrEqual(3);
      for (const disallowed of [
        'image/gif',
        'application/x-msdownload',
        'text/html',
      ]) {
        expect(
          ALLOWED_CONTENT_TYPES.includes(disallowed),
          `${disallowed} must not be in the allowlist — it should be rejected with the validation code, never signed`,
        ).toBe(false);
      }
    });

    it('the only R2 sign lives inside the action body, after parsing — so a parse failure signs nothing', () => {
      // authedAction calls schema.safeParse before fn; the sign is the one async
      // step in fn. If it leaked above the schema there would be a second call.
      const signCount = (actionCode.match(/getSignedUrl\s*\(/g) ?? []).length;
      expect(
        signCount,
        'getSignedUrl must appear exactly once, inside the action body — a disallowed type short-circuits at the schema with no R2 call',
      ).toBe(1);
    });
  });

  // Requirement 3 — a claimed size over the cap is rejected with `validation` and
  // triggers no R2 call. Same boundary: the size bound lives in the schema.
  describe('claimed size over the cap → validation, no R2 call', () => {
    it('caps the claimed size at MAX_BYTES (25 MB) at the Zod boundary', () => {
      expect(MAX_BYTES, 'MAX_BYTES is the single-PUT cap — 25 MB').toBe(
        25 * 1024 * 1024,
      );
      expect(
        /claimedSize[\s\S]*?\.max\s*\(\s*MAX_BYTES\s*\)/.test(actionCode),
        'bound claimedSize with .max(MAX_BYTES) so an over-cap claim fails at the schema and never reaches getSignedUrl',
      ).toBe(true);
    });

    it('requires a positive integer size, so junk never reaches the sign', () => {
      expect(
        /claimedSize[\s\S]*?\.int\s*\(\s*\)/.test(actionCode),
        'claimedSize must be an integer',
      ).toBe(true);
      expect(
        /claimedSize[\s\S]*?\.positive\s*\(\s*\)/.test(actionCode),
        'claimedSize must be positive — a zero/negative claim is rejected with validation, not signed',
      ).toBe(true);
    });
  });
});
