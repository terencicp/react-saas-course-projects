import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '@/lib/files/cursor';
import { UploadError } from '@/lib/files/errors';

// Lesson 4 — Fresh-per-render GETs.
//
// What the runner can and cannot reach. The /files read path signs a live R2 GET
// against a bucket the runner has no credentials for, reads through tenantDb behind a
// session + Postgres the runner has neither of, and renders an async Server Component
// tree. db/queries/file-metadata and app/files/page both transitively import
// `server-only` (through lib/r2, db/tenant, lib/auth), so importing either at runtime
// throws — there is no live signing, no bucket, no DB, and no DOM here.
//
// So each tested observable is proven the only way it is reachable in a node, no-DOM
// run — two pure seams the modules build on are exercised for real, and the rest is
// read off the implementation's own source:
//   • req 1 — a file row renders its original name, a content-type Badge, a humanized
//     size, and an upload time (read off page.tsx's FileRow);
//   • req 4 — a cross-org / soft-deleted fileId resolves to null, and that absence is
//     surfaced as the `not_found` Result code (the real UploadError.toResult is run);
//   • req 5 — the list pages past the first page through the (uploadedAt, id) keyset
//     cursor, which round-trips through the real cursor codec, and the page renders a
//     "Next page" link only when there is a next cursor;
//   • req 6 — render signs N URLs but writes zero audit entries, no matter the count.
// Helpers are inlined; this file imports only vitest, node built-ins, and the
// student's own pure public modules (the cursor codec + the UploadError mapping).

// Anchor reads to the project root (the dir holding package.json), found by walking up
// from this file — so the same file works whether it runs from lesson-verification/ or
// the runner's tests/lessons/ copy. Bases are kept URLs so a path with a space
// ("Chapter 069") survives — a bare string is not a valid `new URL()` base.
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

// Strip block + line comments so prose in the files (which mentions "audit", "url",
// "cache", "tenantDb", etc.) never trips a source-shape assertion — only real code is
// inspected.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const queryCode = stripComments(readSource('src/db/queries/file-metadata.ts'));
const pageCode = stripComments(readSource('src/app/files/page.tsx'));

// Both surfaces start as stubs (the query throws 'not implemented'; the page renders a
// static "No files yet." shell with no list/cursor). Until the student implements them,
// the gates below fail — this single check names that state up front.
const queryIsStub = /not implemented/.test(queryCode);
const pageIsStub = !/listFiles\s*\(/.test(pageCode);

const present = (src: string, re: RegExp) => re.test(src);

describe('Lesson 4 — the /files list signs a fresh download URL per row per render', () => {
  it('the read helpers and the page are implemented (no longer the stubs)', () => {
    expect(
      queryIsStub,
      'db/queries/file-metadata.ts is still the stub throwing "not implemented" — implement getFile / getFileDownloadUrl / listFiles before the rest of the gates can pass',
    ).toBe(false);
    expect(
      pageIsStub,
      'app/files/page.tsx still renders the static "No files yet." shell — call listFiles({ orgId, cursor }) and render the real rows before the rest of the gates can pass',
    ).toBe(false);
  });

  // Requirement 1 — an uploaded file appears as a row showing its original name, its
  // content type as a badge, a humanized size, and its upload time. The row is built
  // from the FileMetadata columns, never from a client-supplied label.
  describe('req 1 — a file row shows original name, type badge, formatted size, and upload time', () => {
    it('lists the files for the current org through listFiles, not a static shell', () => {
      expect(
        present(pageCode, /listFiles\s*\(/),
        "the page must call listFiles to fetch the org's files — the row data comes from the keyset query, not a hardcoded shell",
      ).toBe(true);
      // requireOrgUser supplies the orgId; the list is scoped to that org at the read.
      expect(
        present(pageCode, /listFiles\s*\(\s*\{[\s\S]*?orgId[\s\S]*?\}/),
        "listFiles must be called with the current org's orgId (from requireOrgUser) — the list is tenant-scoped at the read",
      ).toBe(true);
    });

    it("renders each row from the file's own columns: name, content type, byte size, upload time", () => {
      // The four facts the row must surface, each read off the FileMetadata row — a row
      // built from anything else would not be the uploaded file's truth.
      expect(
        present(pageCode, /\.originalFileName\b/),
        'each row must render file.originalFileName — the name the user uploaded under, not the opaque object key',
      ).toBe(true);
      expect(
        present(pageCode, /\.contentType\b/),
        'each row must render file.contentType (as the type badge) — the server-observed type from the HEAD',
      ).toBe(true);
      expect(
        present(pageCode, /\.byteSize\b/),
        'each row must render file.byteSize (humanized) — the measured size, formatted for the row',
      ).toBe(true);
      expect(
        present(pageCode, /\.uploadedAt\b/),
        'each row must render file.uploadedAt — the upload time, as a fixed string',
      ).toBe(true);
    });

    it('shows the content type inside a Badge', () => {
      // The type is rendered as a badge, per the brief — a plain span would not match the
      // finished result.
      expect(
        present(pageCode, /<Badge\b/),
        'render the content type inside a <Badge> — the row shows the type as a badge, not bare text',
      ).toBe(true);
    });

    it('falls back to an explicit empty state when the org has no files', () => {
      // The first observable for an org with zero uploads: an empty-state element, not a
      // blank list — the page is honest about "no files yet".
      expect(
        present(pageCode, /files-empty/),
        'render the files-empty state when there are no rows — an org with no uploads sees an explicit "no files" message, not a blank list',
      ).toBe(true);
    });
  });

  // Requirement 4 — a file uploaded by one org is absent from another org's list, and
  // getFileDownloadUrl for that file while acting as the other org returns the not_found
  // code. The tenancy boundary is structural: every read goes through tenantDb(orgId)
  // filtered to non-deleted rows, so a cross-org id resolves to null, indistinguishable
  // from a missing file.
  describe('req 4 — a cross-org file is absent from the list and its download resolves to not_found', () => {
    it('reads every row through tenantDb(orgId) — the org filter is the outer boundary', () => {
      // listFiles and getFile both go through tenantDb(orgId); that facade is what scopes
      // the query to the org, so another org's rows are never in the result set.
      const tenantReads = (queryCode.match(/tenantDb\s*\(\s*orgId\s*\)/g) ?? [])
        .length;
      expect(
        tenantReads,
        "getFile and listFiles must read through tenantDb(orgId) — the tenancy boundary that keeps one org's files out of another org's list",
      ).toBeGreaterThanOrEqual(2);
    });

    it('filters out soft-deleted rows on every read', () => {
      // isNull(softDeletedAt) on both the single read and the list — a soft-deleted file
      // stays hidden, the same discipline that keeps a cross-org file invisible.
      const softDeleteFilters = (
        queryCode.match(/isNull\s*\(\s*fileMetadata\.softDeletedAt\s*\)/g) ?? []
      ).length;
      expect(
        softDeleteFilters,
        'both getFile and listFiles must filter with isNull(fileMetadata.softDeletedAt) — soft-deleted rows must never appear in a read',
      ).toBeGreaterThanOrEqual(2);
    });

    it("getFile returns null for a fileId that is not the org's — never another org's row", () => {
      // The single read returns row ?? null: a cross-org (or missing) id yields null, so
      // the boundary leaks nothing — a foreign id looks exactly like a deleted one.
      expect(
        present(queryCode, /findFirst\s*\(/),
        'getFile must use findFirst against tenantDb — a single tenant-scoped lookup',
      ).toBe(true);
      expect(
        present(queryCode, /\?\?\s*null/),
        'getFile must return `row ?? null` — a cross-org or missing id resolves to null, indistinguishable from a deleted file',
      ).toBe(true);
    });

    it('maps a missing/cross-org file to object-not-found, which surfaces as the not_found code', () => {
      // getFileDownloadUrl, when getFile returns null, constructs an object-not-found
      // UploadError. We run the REAL UploadError.toResult to prove that domain code
      // observably becomes the not_found Result the caller (and req 4) expects.
      expect(
        present(queryCode, /new\s+UploadError\s*\(\s*['"]object-not-found['"]/),
        'getFileDownloadUrl must raise UploadError("object-not-found", …) when getFile returns null — a cross-org id is treated as a missing file',
      ).toBe(true);

      const result = UploadError.toResult(
        new UploadError('object-not-found', 'That file could not be found.'),
      );
      expect(
        result.ok,
        'an object-not-found UploadError must map to a failed Result — a cross-org download is denied, not served',
      ).toBe(false);
      if (!result.ok) {
        expect(
          result.error.code,
          'object-not-found must surface as the not_found Result code — the contract code req 4 asserts for a cross-org download',
        ).toBe('not_found');
      }
    });
  });

  // Requirement 5 — the list pages past the first page through a keyset "Next page"
  // cursor link. The cursor is the (uploadedAt, id) of the last row of the previous
  // page; the page query selects rows strictly after it in descending order.
  describe('req 5 — the keyset cursor pages past the first page', () => {
    it('round-trips the (uploadedAt, id) keyset through the real cursor codec', () => {
      // The cursor must carry BOTH columns — the composite keyset needs the id to break
      // ties on equal uploadedAt. Exercise the real codec the page reuses (lib/files/
      // cursor.ts) to prove a cursor encodes and decodes back to the same keyset.
      const keyset = {
        uploadedAt: '2026-01-02T03:04:05.000Z',
        id: '0192f1a0-7000-7000-8000-000000000000',
      };
      const token = encodeCursor(keyset);
      expect(
        typeof token === 'string' && token.length > 0,
        'encodeCursor must produce a non-empty cursor token from a (uploadedAt, id) keyset',
      ).toBe(true);
      expect(
        decodeCursor(token),
        'the cursor must round-trip back to the same (uploadedAt, id) keyset — both columns survive, so the next page resumes exactly where the last left off',
      ).toEqual(keyset);
      // A hostile / garbage cursor decodes to null, so the list falls back to page one
      // rather than throwing on a tampered querystring.
      expect(
        decodeCursor('not-a-real-cursor'),
        'a garbage cursor must decode to null — a tampered ?cursor= falls back to the first page, never throws',
      ).toBeNull();
    });

    it('builds the descending (uploadedAt, id) keyset predicate and fetches limit + 1', () => {
      // The keyset predicate: strictly-less uploadedAt, OR equal uploadedAt with a
      // strictly-less id — "the rows after the cursor in descending order". And the n+1
      // trick: fetch one extra row to learn whether a next page exists.
      expect(
        present(queryCode, /lt\s*\(\s*fileMetadata\.uploadedAt/),
        'the page query must use lt(fileMetadata.uploadedAt, …) — the keyset selects rows strictly older than the cursor',
      ).toBe(true);
      expect(
        present(queryCode, /lt\s*\(\s*fileMetadata\.id/),
        'the keyset must tie-break with lt(fileMetadata.id, …) on equal uploadedAt — the id breaks ties so no row is skipped or repeated',
      ).toBe(true);
      expect(
        present(queryCode, /limit\s*:\s*limit\s*\+\s*1/),
        'fetch limit + 1 rows — the extra row tells you whether a next page exists, without a second count query',
      ).toBe(true);
    });

    it('orders newest-first to match the composite index', () => {
      expect(
        present(
          queryCode,
          /orderBy[\s\S]*desc\s*\(\s*fileMetadata\.uploadedAt\s*\)[\s\S]*desc\s*\(\s*fileMetadata\.id\s*\)/,
        ),
        'orderBy must be [desc(uploadedAt), desc(id)] — newest-first, matching the (organizationId, softDeletedAt, uploadedAt desc, id desc) index',
      ).toBe(true);
    });

    it('renders the "Next page" link only when a next cursor exists', () => {
      // The link is gated on nextCursor — present on a full page, absent on the last one,
      // and its href carries the cursor so a click resumes the keyset.
      expect(
        present(pageCode, /nextCursor/),
        'the page must read nextCursor from listFiles and gate the "Next page" link on it — no link on the last page',
      ).toBe(true);
      expect(
        present(pageCode, /cursor=/),
        'the "Next page" link href must carry ?cursor=<token> — clicking it resumes the keyset at the next page',
      ).toBe(true);
    });
  });

  // Requirement 6 — the render writes no audit entry, no matter how many rows it signs.
  // Auditing is action/task-only; a read surface that audited on every paint would
  // flood the trail and slow the page. The audit trail picks back up at finalizeUpload,
  // not here.
  describe('req 6 — render writes no audit entry, regardless of how many rows it signs', () => {
    it('the page never calls logAudit', () => {
      expect(
        present(pageCode, /logAudit\s*\(/),
        'app/files/page.tsx must NOT call logAudit — rendering a read surface is not an audited event; one render must not write N audit rows',
      ).toBe(false);
    });

    it('the read helpers never call logAudit', () => {
      expect(
        present(queryCode, /logAudit\s*\(/),
        'db/queries/file-metadata.ts must NOT call logAudit — signing a download URL on render is not an audited event',
      ).toBe(false);
    });

    it('the read helpers never write to the database (read-only surface)', () => {
      // No insert / update on a read path — the only audit (and the only write) for files
      // lives in finalizeUpload, the action, never in the render.
      expect(
        present(queryCode, /\.insert\s*\(/) ||
          present(queryCode, /\.update\s*\(/),
        'the read helpers must not insert or update — /files is a read surface; the writes (and the audit) belong to the upload action',
      ).toBe(false);
    });

    it('the page never opts into `use cache` — a cached render would freeze the signed URLs', () => {
      // The structural backbone of fresh-per-render: a cached response would outlive the
      // 10-minute signed URLs and leave the page serving dead links. No audit, no cache.
      expect(
        present(pageCode, /['"]use cache['"]/),
        'app/files/page.tsx must NOT declare "use cache" — a cached render freezes the presigned URLs, which then expire; fresh-per-render is structural',
      ).toBe(false);
    });
  });
});
