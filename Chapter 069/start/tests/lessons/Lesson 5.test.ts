import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Lesson 5 — Real downloadUrl for the export.
//
// What the runner can and cannot reach. The closing block of the export task does a
// live server-side R2 PUT and signs a presigned GET against a bucket the runner has no
// credentials for, then writes through tenantDb behind a Postgres the runner does not
// have, all inside an out-of-process Trigger.dev worker. trigger/export-invoices.ts
// transitively imports `server-only` (through @/lib/r2 and @/db/tenant), so importing
// it at runtime throws — there is no live PUT, no bucket, no signer, and no DB here.
//
// So each tested observable is proven the only way it is reachable in a node, no-DOM
// run: read off the export task's own source, after stripping comments so the long
// prose in the file (which mentions "example.com", "downloadUrl", "file_metadata",
// "audit", etc.) never trips a source-shape assertion. Only real code is inspected.
//   • req 1 — the task writes ONE R2 object via a server-side PUT to a key that LEADS
//     with `exports/` and nests the org + run id under it (exports/org/<orgId>/<runId>.csv),
//     and the dead `https://example.com/...` placeholder is gone;
//   • req 2 — a SINGLE signed URL (from getSignedGetForKey) is the value handed to both
//     metadata.set('downloadUrl', …) and the sendExportEmail child — the panel and the
//     email cannot drift to different links;
//   • req 3 — the export writes NO file_metadata row (no insert into the fileMetadata
//     table) — a throwaway artifact is a different lifecycle from a user file;
//   • req 4 — the idempotency invariant the runner can reach without driving a real
//     kill-resume: the PUT key is derived from ctx.run.id (one object per run, an
//     overwrite-idempotent re-PUT on a parent retry), the PUT sits BEFORE the close-out
//     transaction (an external call never inside a DB tx), and exactly ONE
//     export.invoices.completed audit row is written per run. The full kill-resume drill
//     (Ctrl-C at pagesDone 2/7, restart, one CSV/one email/one audit row) cannot be
//     driven in this runner — it is the by-hand check in "Moment of truth".
//
// Helpers are inlined; this file imports only vitest and node built-ins — no live R2,
// no DB, no module under @/ is imported (they would pull in `server-only`).

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

// Strip block + line comments so the file's prose (which names "example.com",
// "downloadUrl", "file_metadata", "audit", the PUT order, etc.) never trips a
// source-shape assertion — only executable code is inspected.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const taskCode = stripComments(readSource('trigger/export-invoices.ts'));

const present = (src: string, re: RegExp) => re.test(src);

// The chapter-067 starting point hardcodes `downloadUrl = https://example.com/...` after
// the page loop and never touches R2. Until the student swaps that placeholder for the
// real PUT-sign-set block, the gates below fail — this single check names that state.
const stillPlaceholder = present(taskCode, /example\.com/);

describe('Lesson 5 — the export writes a real R2 object and signs its downloadUrl', () => {
  it('the placeholder is gone — the export no longer points downloadUrl at https://example.com', () => {
    expect(
      stillPlaceholder,
      'trigger/export-invoices.ts still builds downloadUrl from `https://example.com/...` — replace that dead placeholder with a real R2 PUT + a getSignedGetForKey GET before the rest of the gates can pass',
    ).toBe(false);
  });

  // Requirement 1 — triggering an export writes ONE R2 object at
  // exports/org/<orgId>/<runId>.csv via a server-side PUT. The worker already holds the
  // CSV in memory, so it PUTs the bytes itself (no presigned PUT back to itself); the key
  // LEADS with `exports/` so the bucket-wide 7-day lifecycle rule (a literal leading
  // prefix) sweeps every org's CSVs.
  describe('req 1 — one server-side PUT writes the CSV to exports/org/<orgId>/<runId>.csv', () => {
    it('PUTs the bytes itself with a PutObjectCommand — the worker holds the CSV, no presigned PUT', () => {
      expect(
        present(taskCode, /r2\.send\s*\(/),
        'the task must call r2.send(new PutObjectCommand(...)) — a worker has no browser to offload to, so it PUTs the bytes it already holds directly to R2',
      ).toBe(true);
      expect(
        present(taskCode, /new\s+PutObjectCommand\s*\(/),
        'the task must build a PutObjectCommand — the server-side write of the accumulated CSV',
      ).toBe(true);
      // The Body is the CSV bytes, not a stray string — the bytes the loop accumulated.
      expect(
        present(taskCode, /Body\s*:\s*Buffer\.from\s*\(\s*csv\s*\)/) ||
          present(taskCode, /Buffer\.from\s*\(\s*csv\s*\)/),
        'the PUT Body must be Buffer.from(csv) — the bytes the page loop accumulated, written in one server-side PUT',
      ).toBe(true);
      // The bucket is the shared lib/r2 BUCKET — one bucket per environment, the
      // exports/ prefix (not a second bucket) carries the workload split.
      expect(
        present(taskCode, /Bucket\s*:\s*BUCKET/),
        'the PUT must target the shared BUCKET from lib/r2 — one bucket per environment; the exports/ prefix carries the split, not a second bucket',
      ).toBe(true);
    });

    it('writes to a key that LEADS with exports/ and nests org + run id under it', () => {
      // The exact key shape req 1 names: `exports/org/<orgId>/<runId>.csv`. The leading
      // `exports/` is load-bearing — R2 lifecycle matches a literal leading prefix, so the
      // rule that sweeps every org's CSVs needs the prefix FIRST, with org scoping nested
      // under it (NOT `org/<id>/exports/...`, which the lifecycle rule would miss).
      expect(
        present(taskCode, /Key\s*:\s*objectKey/) ||
          present(taskCode, /Key\s*:\s*`exports\/org\//),
        'the PUT Key must be the exports/-prefixed object key — name the key once and pass it as Key',
      ).toBe(true);
      expect(
        present(
          taskCode,
          /`exports\/org\/\$\{\s*organizationId\s*\}\/\$\{\s*ctx\.run\.id\s*\}\.csv`/,
        ),
        'the object key must be `exports/org/<orgId>/<runId>.csv` — exports/ LEADS so the literal-prefix lifecycle rule matches; org + run id nest under it (a per-run, overwrite-idempotent key)',
      ).toBe(true);
    });

    it('bakes the download filename into the stored object at PUT time', () => {
      // ContentDisposition is set on the PUT (not on the GET) so the download name is part
      // of the stored object — getSignedGetForKey stays a bare-key signer. The name is the
      // day-bucketed export-<day>.csv.
      expect(
        present(
          taskCode,
          /ContentDisposition\s*:\s*`attachment;\s*filename="export-\$\{\s*dayBucket\(\)\s*\}\.csv"`/,
        ),
        'the PUT must set ContentDisposition `attachment; filename="export-<dayBucket()>.csv"` — the download name is baked into the stored object at PUT time, so the GET signer stays a bare-key signer',
      ).toBe(true);
      expect(
        present(taskCode, /ContentType\s*:\s*['"]text\/csv['"]/),
        "the PUT must set ContentType: 'text/csv' — the stored object's type",
      ).toBe(true);
    });
  });

  // Requirement 2 — the export email and the inspector metadata.downloadUrl carry the
  // SAME signed URL. One getSignedGetForKey call produces one url; that single value is
  // the one fed to metadata.set and to the sendExportEmail child — they cannot drift.
  describe('req 2 — the email and metadata.downloadUrl carry the same signed URL', () => {
    it('signs the GET on the key it just wrote, with a 10-minute expiry', () => {
      // getSignedGetForKey is the tenant-free signer (the worker owns the key inside the
      // trust boundary, so there is no org row to scope against). expiresIn 600 = 10 min:
      // a user opening the email an hour later gets a dead link — the senior call is
      // re-trigger, not a longer-lived URL.
      expect(
        present(taskCode, /getSignedGetForKey\s*\(/),
        'the task must sign the download GET with getSignedGetForKey — the tenant-free signer for the key the worker just wrote',
      ).toBe(true);
      expect(
        present(taskCode, /expiresIn\s*:\s*600/),
        'the signed GET must use expiresIn: 600 (10 minutes) — the short window the lesson teaches; the fix for a stale link is re-trigger, not a longer-lived URL',
      ).toBe(true);
    });

    it('binds downloadUrl to the signed url and never reassigns it', () => {
      // The single source of truth: downloadUrl is the url destructured off
      // getSignedGetForKey. There must be no DIRECT reassignment (e.g. the old
      // `const downloadUrl = \`https://example.com/...\`` line) that could make the panel
      // and the email diverge.
      expect(
        present(
          taskCode,
          /\{\s*url\s*:\s*downloadUrl\s*\}\s*=\s*await\s+getSignedGetForKey/,
        ),
        'downloadUrl must be the `url` destructured from `await getSignedGetForKey(...)` — the one signed link that both the panel and the email use',
      ).toBe(true);
      // A plain `downloadUrl = ...` (the identifier directly assigned, not the
      // `{ url: downloadUrl } = ...` destructuring above) is the leftover placeholder
      // shape — there must be none.
      const directAssignments = (
        taskCode.match(/(?:^|[^.\w])downloadUrl\s*=[^=]/g) ?? []
      ).length;
      expect(
        directAssignments,
        'downloadUrl must come only from destructuring getSignedGetForKey — a direct `downloadUrl = …` reassignment (the leftover example.com placeholder) would let the panel and the email drift to different links',
      ).toBe(0);
    });

    it('publishes that same downloadUrl to both the inspector panel and the email child', () => {
      // metadata.set('downloadUrl', downloadUrl) → the inspector panel renders this.
      expect(
        present(
          taskCode,
          /metadata\.set\s*\(\s*['"]downloadUrl['"]\s*,\s*downloadUrl\s*\)/,
        ),
        "the task must metadata.set('downloadUrl', downloadUrl) — the value the inspector completion panel renders as the clickable link",
      ).toBe(true);
      // The email child receives the same downloadUrl variable — same value, not a
      // re-signed or re-built URL.
      expect(
        present(taskCode, /sendExportEmail\b/),
        'the task must hand the export to the sendExportEmail child — the email carries the link to the user',
      ).toBe(true);
      expect(
        present(taskCode, /downloadUrl\s*,/) ||
          present(taskCode, /downloadUrl\s*\}/),
        'the sendExportEmail child must be passed the same downloadUrl variable (not a freshly re-signed URL) — the email and the panel carry the identical signed link',
      ).toBe(true);
    });
  });

  // Requirement 3 — the export writes NO file_metadata row. The export is a single-
  // consumer throwaway artifact; the 7-day lifecycle rule on the exports/ prefix handles
  // cleanup. A user file gets a row (finalizeUpload); an export deliberately does not.
  describe('req 3 — the export writes no file_metadata row', () => {
    it('never inserts into the fileMetadata table', () => {
      // The observable that `select count(*) from file_metadata where object_key like
      // 'exports/%'` returns 0: the export task contains no insert into fileMetadata.
      expect(
        present(taskCode, /\.insert\s*\(\s*fileMetadata/),
        'the export task must NOT insert a fileMetadata row — an export is a throwaway, single-consumer artifact swept by the exports/ lifecycle rule; only user uploads get a metadata row',
      ).toBe(false);
      expect(
        present(taskCode, /\bfileMetadata\b/),
        'the export task must not reference the fileMetadata table at all — it writes no row there, so the count of export-prefixed metadata rows stays 0',
      ).toBe(false);
    });
  });

  // Requirement 4 — the idempotency invariant the runner can reach without driving a real
  // kill-resume. The full drill (Ctrl-C at pagesDone 2/7, restart, exactly one CSV / one
  // email / one audit row) runs out-of-process and is the by-hand check; here we assert
  // the structural facts that MAKE it hold: a per-run overwrite-idempotent key, the PUT
  // placed before the close-out transaction, and a single completion audit write.
  describe('req 4 — the structure that keeps kill-resume idempotent (one object, one audit row)', () => {
    it('keys the object on ctx.run.id so a parent retry re-PUTs the SAME key (idempotent overwrite)', () => {
      expect(
        present(taskCode, /ctx\.run\.id/),
        'the object key must be derived from ctx.run.id — one object per run, so a resumed/retried parent re-PUTs the same key and the overwrite is idempotent (never a second CSV)',
      ).toBe(true);
    });

    it('does the external PUT BEFORE the close-out DB transaction — an external call never sits inside a tx', () => {
      // The PUT (r2.send) must appear before tenantDb(...).transaction in source order. An
      // external call inside a DB transaction holds the tx open across network latency and
      // cannot be rolled back; placing it before the close-out tx (and at the end of the
      // resumed parent) keeps the chapter-067 cross-step idempotency intact.
      const putIndex = taskCode.search(/r2\.send\s*\(/);
      const txIndex = taskCode.search(
        /tenantDb\s*\([^)]*\)\s*\.transaction\s*\(/,
      );
      expect(
        putIndex,
        'the task must perform the R2 PUT (r2.send) — the server-side write of the CSV',
      ).toBeGreaterThanOrEqual(0);
      expect(
        txIndex,
        'the task must close out in a tenantDb(...).transaction — the exports-row update + the completion audit write',
      ).toBeGreaterThanOrEqual(0);
      expect(
        putIndex < txIndex,
        'the R2 PUT must come BEFORE the close-out transaction — an external call never sits inside a DB transaction; placing it last (after the loop, before the tx) keeps kill-resume idempotent',
      ).toBe(true);
    });

    it('writes exactly one export.invoices.completed audit entry per run', () => {
      // One run, one completion audit row — the same fact the by-hand kill-resume drill
      // checks (`one audit entry`). A task has no session, so the audit is written with
      // explicit context; the runner asserts the single completion write is present.
      expect(
        present(taskCode, /['"]export\.invoices\.completed['"]/),
        'the task must write a single export.invoices.completed audit entry on the run that finished — the completion record the kill-resume drill expects exactly once',
      ).toBe(true);
      const completionAudits = (
        taskCode.match(/['"]export\.invoices\.completed['"]/g) ?? []
      ).length;
      expect(
        completionAudits,
        'export.invoices.completed must be logged exactly once per run — a duplicate completion audit would break the one-audit-row invariant the kill-resume drill checks',
      ).toBe(1);
    });
  });
});
