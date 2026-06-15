import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Lesson 3 — Browser PUT, HEAD, then insert.
//
// What the runner can and cannot reach. finalizeUpload HEADs a live R2 object and
// then writes to Postgres behind authedAction → requireOrgUser (a session + DB the
// runner has neither of). Its module transitively imports `server-only` (through
// lib/r2, db/tenant, db/audit-log, lib/auth/authed-action), so importing the action
// at runtime throws — there is no live execution, no bucket, and no DB here.
//
// So the three tested observables are read off finalizeUpload's own source — the only
// place those facts are observable in a node, no-DOM run:
//   • req 2 — the inserted row takes byteSize/contentType from the HEAD (not the
//     client's claim) and uploadedBy from the authenticated user;
//   • req 4 — an over-cap object (a client that lied about its size at signing) is
//     caught at the HEAD with size-mismatch, before any insert;
//   • req 6 — exactly one file.uploaded audit entry, written inside the SAME
//     transaction as the row insert.
// Helpers are inlined; this file imports only vitest and node built-ins.

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

// Strip block + line comments so prose in the file (which mentions "byteSize", "row",
// "audit", etc.) never trips a source-shape assertion — only real code is inspected.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const finalizeCode = stripComments(readSource('src/lib/files/finalize.ts'));

// The single-PUT cap (25 MB), read off its declaration in lib/r2.ts. The Client
// Component cannot import the server-only module, so the policy is read as a literal.
const MAX_BYTES = (() => {
  const r2Source = readSource('src/lib/r2.ts');
  const expr = r2Source.match(/MAX_BYTES\s*=\s*([0-9*\s]+)/)?.[1] ?? '0';
  return expr
    .split('*')
    .map((n) => Number(n.trim()))
    .reduce((a, b) => a * b, 1);
})();

// Helper — does this identifier appear anywhere in the finalize body?
const present = (re: RegExp) => re.test(finalizeCode);

describe('Lesson 3 — finalizeUpload HEADs then inserts, from server-observed truth', () => {
  // Sanity: until the student implements the action, every gate below fails. This
  // catches the stub state with a single clear message rather than five cryptic ones.
  it('is implemented (no longer the "Not implemented" stub)', () => {
    expect(
      /Not implemented/.test(finalizeCode),
      'finalizeUpload is still the stub returning err("internal", "Not implemented") — implement the HEAD-then-insert before the rest of the gates can pass',
    ).toBe(false);
    expect(
      present(/new\s+HeadObjectCommand\s*\(/),
      'finalizeUpload must HEAD the object the browser PUT — issue a HeadObjectCommand against the objectKey',
    ).toBe(true);
  });

  // Requirement 2 — after a successful upload, one file_metadata row exists with
  // byteSize and contentType taken from the post-upload HEAD and uploadedBy set to the
  // current user. The lesson's whole point: the server reads the file's truth back from
  // storage, it never trusts the client's claim.
  describe('req 2 — the row is written from HEAD-observed values, never the client claim', () => {
    it('HEADs the object before writing anything', () => {
      // The order is the trust boundary: read storage first, then insert.
      const headAt = finalizeCode.search(/new\s+HeadObjectCommand\s*\(/);
      const insertAt = finalizeCode.search(/\.insert\s*\(/);
      expect(
        headAt,
        'HeadObjectCommand must appear — the row is built from what storage reports, not the client',
      ).toBeGreaterThanOrEqual(0);
      expect(
        insertAt,
        'the row insert must appear — finalize records the upload as a file_metadata row',
      ).toBeGreaterThanOrEqual(0);
      expect(
        headAt < insertAt,
        'HEAD must run BEFORE the insert — you read the true size/type back from R2, then write the row',
      ).toBe(true);
    });

    it('inserts byteSize and contentType from the HEAD result, not from the input claim', () => {
      // ContentLength / ContentType come off the HeadObjectCommandOutput. A row built
      // from input.* (the claim) would defeat the whole boundary.
      expect(
        present(/ContentLength/),
        "byteSize must be read from the HEAD's ContentLength — R2 does not enforce the signed size, so the HEAD is the real measurement",
      ).toBe(true);
      expect(
        present(/\.ContentType\b/),
        "contentType must be read from the HEAD's ContentType — the server confirms what actually landed, not what the client claimed",
      ).toBe(true);
      // byteSize is assigned off ContentLength (with a 0 fallback), then inserted.
      expect(
        present(/byteSize\s*=\s*[^;]*ContentLength/),
        'derive byteSize from head.ContentLength (e.g. `const byteSize = head.ContentLength ?? 0`) so the stored size is the measured one',
      ).toBe(true);
    });

    it('stamps uploadedBy with the authenticated user from ctx, not a client field', () => {
      expect(
        present(/uploadedBy\s*:\s*ctx\.user\.id/),
        'uploadedBy must be set from ctx.user.id (the authenticated session) — never from the request body',
      ).toBe(true);
    });

    it('keys the row to the server-generated uploadId', () => {
      // The row id is the same uuidv7 presignedPut built into the objectKey — so a row
      // and its object share an identity, and a replayed finalize collides.
      expect(
        present(/id\s*:\s*input\.uploadId/),
        'the row id must be input.uploadId — the server-generated id, so the row and its R2 object share one identity',
      ).toBe(true);
    });
  });

  // Requirement 4 — a client that signs a small claimed size and then PUTs an over-cap
  // body is rejected at finalize with size-mismatch, and no row is inserted. The HEAD
  // sees the real bytes; the signing-time claim is irrelevant by now.
  describe('req 4 — an over-cap object is caught at the HEAD with size-mismatch, before any insert', () => {
    it('compares the HEAD-observed size against the 25 MB cap', () => {
      expect(MAX_BYTES, 'MAX_BYTES is the single-object cap — 25 MB').toBe(
        25 * 1024 * 1024,
      );
      expect(
        present(/byteSize\s*>\s*MAX_BYTES/),
        'compare the measured byteSize against MAX_BYTES — a body bigger than the cap (a client that lied at signing) is caught here, reading the real bytes',
      ).toBe(true);
    });

    it('maps the oversize case to a size-mismatch UploadError', () => {
      // size-mismatch is the contract code for "what landed isn't what was signed",
      // covering both the type-mismatch and the over-cap branches.
      expect(
        present(/size-mismatch/),
        'an over-cap (or wrong-type) object must surface as a size-mismatch UploadError — the client claim and the real object disagree',
      ).toBe(true);
      // The size-mismatch must be raised before the insert, so no row lands.
      const mismatchAt = finalizeCode.search(/size-mismatch/);
      const insertAt = finalizeCode.search(/\.insert\s*\(/);
      expect(
        mismatchAt < insertAt,
        'the size check must return BEFORE the insert — an over-cap body must leave zero rows behind',
      ).toBe(true);
    });

    it('also rejects a content type that disagrees with what was signed', () => {
      // The other half of the boundary: the HEAD's ContentType must equal the signed
      // contentType, else the object is not what the URL was minted for.
      expect(
        present(/head\.ContentType\s*!==\s*input\.contentType/),
        'reject when head.ContentType !== input.contentType — the object that landed must be the type the URL was signed for',
      ).toBe(true);
    });
  });

  // Requirement 6 — each successful upload records exactly one file.uploaded audit
  // entry, committed in the same transaction as the row. Both land or neither does.
  describe('req 6 — one file.uploaded audit entry, committed in the same transaction as the row', () => {
    it('wraps the insert and the audit write in one tenantDb transaction', () => {
      expect(
        present(/tenantDb\s*\(\s*ctx\.orgId\s*\)\s*\.transaction/),
        'open a single tenantDb(ctx.orgId).transaction around the write — the row and its audit entry must commit or roll back together',
      ).toBe(true);
    });

    it('writes exactly one file.uploaded audit entry', () => {
      const auditCalls = finalizeCode.match(/logAudit\s*\(/g) ?? [];
      expect(
        auditCalls.length,
        'logAudit must be called exactly once in finalizeUpload — one upload, one audit entry',
      ).toBe(1);
      expect(
        present(/action\s*:\s*['"]file\.uploaded['"]/),
        'the audit action must be "file.uploaded" — the contract event for a recorded upload',
      ).toBe(true);
    });

    it('runs the audit write on the transaction handle, inside the transaction block', () => {
      // Passing the tx handle (not the ambient db) is what binds the audit row to the
      // same atomic unit as the insert. logAudit's first arg must be the tx.
      expect(
        present(/logAudit\s*\(\s*tx\b/),
        'logAudit must take the transaction handle (logAudit(tx, …)) so the audit entry commits in the same transaction as the row',
      ).toBe(true);
      const insertAt = finalizeCode.search(/\.insert\s*\(/);
      const auditAt = finalizeCode.search(/logAudit\s*\(/);
      const txAt = finalizeCode.search(/\.transaction\s*\(/);
      expect(
        txAt < insertAt && txAt < auditAt,
        'both the insert and logAudit must sit inside the .transaction(...) callback — neither may run outside it',
      ).toBe(true);
    });

    it('maps a replayed finalize (duplicate key) to conflict, not a duplicate row', () => {
      // The unique(objectKey) constraint is the second defense layer: a re-run finalize
      // trips 23505, which isUniqueViolation turns into a conflict Result.
      expect(
        present(/isUniqueViolation\s*\(/),
        'a duplicate-key violation (a replayed finalize) must be caught with isUniqueViolation and mapped to conflict — never a second row',
      ).toBe(true);
      expect(
        present(/err\s*\(\s*['"]conflict['"]/),
        'the duplicate-key path must return err("conflict", …) — the unique(objectKey) constraint is the second layer guarding against a replayed finalize',
      ).toBe(true);
    });
  });
});
