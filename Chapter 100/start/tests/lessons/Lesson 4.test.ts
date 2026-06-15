import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 4 — PR 2 (Migrate): dual-write all three columns in one statement, the
// idempotent/bounded backfill, and the integer-cents combined-amount helper.
//
// What can and cannot run here. `combinedAmount` is a pure helper (no server-only,
// no DB), so it is imported and EXERCISED with real inputs — that is the one piece
// of observable behavior we can prove by running it. The actions, queries, and
// backfill all sit behind `import 'server-only'` or a live `postgres()` client that
// would throw the instant it is imported into this node-env runner, so those are
// SOURCE-SHAPE probes: read the file the student edits and prove it carries the
// structure that produces the observable behavior (three columns in one write, the
// `WHERE subtotal IS NULL` re-guard that makes a re-run a no-op). We never assert a
// file path or import the student must use a particular way — only the load-bearing
// tokens a correct migrate step must carry.
//
// Self-contained: imports only `vitest`, node built-ins, and the student's pure
// `combinedAmount` helper; inlines its own source readers.

// ── helpers ──────────────────────────────────────────────────────────────────────

// Read a project file relative to the project root (two levels up from
// tests/lessons/). The base stays a URL — never fileURLToPath it: a bare path is not
// a valid `new URL()` base and throws "Invalid URL"; a file: URL is, and handles the
// space in "Chapter 100".
const readProjectFile = (rel: string): string =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const tryRead = (rel: string): string | null => {
  try {
    return readProjectFile(rel);
  } catch {
    return null;
  }
};

// Strip TS comments before probing. The start stubs carry TODO(L4) comments that
// name the very tokens we look for ("subtotal", "tax", "WHERE subtotal IS NULL"),
// which would falsely satisfy a naive regex — match real source, not the prose
// telling the student what to write.
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// JSX comments ({/* … */}) wrap the edit-form TODO markers; drop them too.
const stripJsxComments = (s: string): string =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const readCode = (rel: string): string => {
  const raw = tryRead(rel);
  if (raw === null) {
    throw new Error(
      `Could not read ${rel}. Make the change the lesson asks for in that file before this gate can pass.`,
    );
  }
  return stripComments(raw);
};

// The start stubs still carry their TODO(L4) marker; once the student does the work
// the marker is gone. While it is present the seam is unwritten — report that plainly
// instead of leaking a confusing regex miss.
const stillStub = (raw: string): boolean => /TODO\(L4\)/.test(raw);

// Slice out the body of a single named action call, `export const <name> = ...(` up
// to the matching close, so an assertion about `updateInvoice` is not satisfied by
// tokens that only live in `createInvoice`.
const actionBody = (code: string, name: string): string => {
  const start = code.indexOf(`export const ${name}`);
  if (start === -1) return '';
  return code.slice(start);
};

const ACTIONS = 'src/lib/invoices/actions.ts';
const BACKFILL = 'scripts/backfill_subtotal_tax.ts';
const EDIT_FORM = 'src/app/(protected)/invoices/[id]/edit/edit-form.tsx';

// ── Requirement 1 ──────────────────────────────────────────────────────────────────
// Creating an invoice persists `subtotal`, `tax`, and a `total` equal to the
// integer-cents sum of the two. The persistence shape is a source probe; the
// "total = integer-cents sum, no float drift" rule is proven by running the helper.
describe('Req 1 — create persists subtotal + tax and a total that is their integer-cents sum', () => {
  it('combinedAmount adds in integer cents and returns a numeric(12,2) string', async () => {
    const { combinedAmount } = await import('@/lib/invoices/money');
    expect(
      combinedAmount({ subtotal: '100.00', tax: '8.50' }),
      'combinedAmount({ subtotal: "100.00", tax: "8.50" }) must return "108.50" — the combined total is subtotal + tax formatted to two decimals.',
    ).toBe('108.50');
    expect(
      combinedAmount({ subtotal: '100', tax: '0' }),
      'combinedAmount must always format to two decimals (numeric(12,2) shape): "100" + "0" is "100.00".',
    ).toBe('100.00');
  });

  it('adds in integer cents so float drift never reaches the total', async () => {
    const { combinedAmount } = await import('@/lib/invoices/money');
    // 0.1 + 0.2 === 0.30000000000000004 with a float `+`. The helper must round to
    // cents BEFORE adding, so this is the canonical drift case the lesson exists to teach.
    expect(
      combinedAmount({ subtotal: '0.10', tax: '0.20' }),
      'combinedAmount({ subtotal: "0.10", tax: "0.20" }) must be "0.30", not "0.30000000000000004". Add in integer cents (Math.round(Number(x) * 100)) before formatting — a float `+` on the dollar strings drifts.',
    ).toBe('0.30');
    expect(
      combinedAmount({ subtotal: '19.99', tax: '0.01' }),
      'combinedAmount({ subtotal: "19.99", tax: "0.01" }) must be "20.00" — integer-cents addition, not float arithmetic.',
    ).toBe('20.00');
  });

  it('createInvoice accepts the subtotal/tax pair and writes both columns', () => {
    const raw = readProjectFile(ACTIONS);
    expect(
      stillStub(raw),
      'src/lib/invoices/actions.ts still carries the TODO(L4) marker — teach createInvoice the subtotal/tax pair before this gate can pass.',
    ).toBe(false);

    const code = stripComments(raw);
    const create = actionBody(code, 'createInvoice');
    expect(
      /subtotal/.test(create) && /tax/.test(create),
      'createInvoice must accept and write `subtotal` and `tax` — the create path no longer takes a single combined `total`.',
    ).toBe(true);
  });
});

// ── Requirement 2 ──────────────────────────────────────────────────────────────────
// Editing an invoice persists the new subtotal/tax and bumps the version, with the
// optimistic-concurrency precondition (the honest 409) left intact.
describe('Req 2 — edit persists subtotal/tax in one write and keeps the version precondition', () => {
  const updateBody = (): string =>
    actionBody(readCode(ACTIONS), 'updateInvoice');

  it('the update writes subtotal and tax in a single structural .set({...})', () => {
    const update = updateBody();
    expect(
      /subtotal/.test(update) && /tax/.test(update),
      'updateInvoice must write `subtotal` and `tax`. The classic bug is writing them in a separate statement "later" — keep all the money columns in ONE .set({...}) so the write can never half-apply.',
    ).toBe(true);
    // Structural dual-write: the money columns sit inside the same .set({...}) call.
    const setBlock = update.match(/\.set\(\{[\s\S]*?\}\)/);
    expect(
      setBlock !== null &&
        /subtotal/.test(setBlock[0]) &&
        /tax/.test(setBlock[0]),
      'subtotal and tax must live inside the same .set({...}) as the rest of the row — a single structural write, not a second statement that could diverge.',
    ).toBe(true);
  });

  it('bumps the row version on update', () => {
    const update = updateBody();
    expect(
      /version:\s*row\.version\s*\+\s*1/.test(update),
      'updateInvoice must set `version: row.version + 1` in the same write — the optimistic-concurrency counter advances with every edit.',
    ).toBe(true);
  });

  it('keeps the version precondition (the honest 409) before writing', () => {
    const update = updateBody();
    expect(
      /row\.version\s*!==\s*input\.version/.test(update) &&
        /conflict\(/.test(update),
      'updateInvoice must still return a conflict when `row.version !== input.version` (unless overwrite) — the migrate step changes the money columns, not the concurrency guard.',
    ).toBe(true);
  });
});

// ── Requirement 5 ──────────────────────────────────────────────────────────────────
// The backfill is bounded and idempotent: it selects only un-backfilled rows in
// batches, re-guards the UPDATE on `subtotal IS NULL`, and loops until a pass touches
// no rows — so a second run writes zero rows.
describe('Req 5 — the backfill is bounded and idempotent (a re-run writes no rows)', () => {
  const backfill = (): string => {
    const raw = readProjectFile(BACKFILL);
    expect(
      stillStub(raw),
      'scripts/backfill_subtotal_tax.ts still carries the TODO(L4) marker (it logs "[backfill] not implemented") — implement the bounded-idempotent loop before this gate can pass.',
    ).toBe(false);
    return stripComments(raw);
  };

  it('runs on the unpooled connection (a long script, not the pooler transaction mode)', () => {
    const code = backfill();
    expect(
      /dbUnpooled/.test(code),
      'The backfill must run on `dbUnpooled` — a long-running script wants the direct connection, not the pooler that runs in transaction mode.',
    ).toBe(true);
  });

  it('selects only un-backfilled rows, bounded by a batch limit', () => {
    const code = backfill();
    expect(
      /subtotal\s+is\s+null/i.test(code),
      'The backfill must scope its work to rows that still need it (`where subtotal is null`) — without that filter every run rewrites every row.',
    ).toBe(true);
    expect(
      /\blimit\b/i.test(code),
      'The backfill must bound each pass with a `limit` (batch size) rather than loading the whole table into memory at once.',
    ).toBe(true);
  });

  it('re-guards the UPDATE on subtotal IS NULL so a re-run is a no-op', () => {
    const code = backfill();
    const update = code.match(/update\s+invoices[\s\S]*?(?:returning|;|`)/i);
    expect(
      update !== null,
      'The backfill must issue an `update invoices set subtotal = total, tax = ...` statement to fill the legacy rows.',
    ).toBe(true);
    expect(
      update !== null && /subtotal\s+is\s+null/i.test(update[0]),
      'The UPDATE must repeat the `and subtotal is null` guard in its WHERE — this is the idempotency/concurrency lock: a second run (or a row a live dual-write already filled) matches zero rows.',
    ).toBe(true);
  });

  it('loops until a pass touches no rows', () => {
    const code = backfill();
    expect(
      /while\s*\(/.test(code),
      'The backfill must loop (e.g. `while (true)`) over successive batches and stop when a pass touches no rows — one query cannot drain a table larger than the batch size.',
    ).toBe(true);
    expect(
      /break/.test(code),
      'The loop must `break` once a batch comes back empty — that empty pass is how the run knows the table is fully backfilled.',
    ).toBe(true);
  });
});

// ── Edit form (supports Req 1 & 2) ──────────────────────────────────────────────────
// The single combined-amount input is replaced by separate subtotal + tax inputs, so
// every create/edit posts the pair the actions now expect.
describe('Edit form posts the subtotal/tax pair', () => {
  it('renders a subtotal input and a tax input instead of one total input', () => {
    const raw = tryRead(EDIT_FORM);
    expect(
      raw,
      `Could not read ${EDIT_FORM}. Split the Amount field into Subtotal + Tax inputs as the lesson asks.`,
    ).not.toBeNull();
    const code = stripJsxComments(stripComments(raw ?? ''));
    expect(
      /name="subtotal"/.test(code),
      'The edit form must post a `subtotal` field — the form feeds the dual-write, so it needs the new pair of inputs.',
    ).toBe(true);
    expect(
      /name="tax"/.test(code),
      'The edit form must post a `tax` field alongside `subtotal`.',
    ).toBe(true);
    expect(
      /name="total"/.test(code),
      'The single combined `name="total"` input must be gone — it is replaced by the subtotal + tax pair.',
    ).toBe(false);
  });
});
