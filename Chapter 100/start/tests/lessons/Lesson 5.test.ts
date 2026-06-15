import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 5 — PR 3 (Contract): drop the legacy `total` column, strip every legacy
// reference, and land production on the target subtotal + tax schema.
//
// Node env, no DOM. The mutation/read modules (`actions.ts`, `queries.ts`,
// `schema.ts`) pull in `server-only` + the env boundary + a live Postgres client,
// so they cannot be runtime-imported here — the observable this lesson produces is
// the generated migration SQL plus the settled shape of those source files. The
// pure money helper, by contrast, has no server deps, so we exercise it for real.

// Read a project source file relative to the project root (one level up from
// tests/lessons/). A URL base keeps spaces in the path ("Chapter 100") valid.
const readSource = (rel: string): string =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const schema = () => readSource('src/db/schema.ts');
const actions = () => readSource('src/lib/invoices/actions.ts');
const queries = () => readSource('src/lib/invoices/queries.ts');

// The drizzle/ folder holds one generated SQL file per migration. Lesson 5's
// contract migration is the highest-numbered file whose name ends in the drop.
const findContractMigration = (): string => {
  const dir = new URL('../../drizzle/', import.meta.url);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  // The contract migration drops `total`; find the file that does so.
  for (const f of files.reverse()) {
    const sql = readFileSync(new URL(f, dir), 'utf8');
    if (/drop\s+column\s+"?total"?/i.test(sql)) {
      return sql;
    }
  }
  return '';
};

describe('Lesson 5 — req 1: the contract migration is a single DROP COLUMN total', () => {
  it('a generated migration drops the total column', () => {
    const sql = findContractMigration();
    expect(
      /alter\s+table\s+"?invoices"?\s+drop\s+column\s+"?total"?/i.test(sql),
      'No generated migration drops the `total` column. Run `pnpm db:generate` after removing `total` from src/db/schema.ts so a `DROP COLUMN "total"` migration is created under drizzle/.',
    ).toBe(true);
  });

  it('contains nothing destructive beyond that one drop', () => {
    const sql = findContractMigration();
    // Strip comments and the statement-breakpoint marker, then look for any other
    // destructive verb. The contract step is the cadence's one irreversible move —
    // it must carry the column drop and nothing else.
    const body = sql
      .replace(/--.*$/gm, '')
      .replace(/-->\s*statement-breakpoint/gi, '');
    const dropCount = (body.match(/\bdrop\s+(column|table)\b/gi) ?? []).length;
    expect(
      dropCount,
      `The contract migration should drop only the single \`total\` column, but it contains ${dropCount} drop statements. Keep PR 3 to the one-statement drop — anything else belongs in a separate, earlier PR.`,
    ).toBe(1);
    expect(
      /\bdrop\s+table\b/i.test(body),
      'The contract migration drops a table. PR 3 should only `DROP COLUMN "total"` — never a table.',
    ).toBe(false);
    expect(
      /\btruncate\b/i.test(body),
      'The contract migration contains a TRUNCATE. PR 3 should only `DROP COLUMN "total"`.',
    ).toBe(false);
  });
});

describe('Lesson 5 — req 2: schema and mutations settle on subtotal + tax only', () => {
  it('the schema carries the subtotal/tax pair and no total column', () => {
    const src = schema();
    expect(
      /\bsubtotal\s*:\s*numeric\(/.test(src),
      '`subtotal` is not a numeric column in src/db/schema.ts. The target shape is two NOT NULL numeric(12,2) money columns.',
    ).toBe(true);
    expect(
      /\btax\s*:\s*numeric\(/.test(src),
      '`tax` is not a numeric column in src/db/schema.ts. The target shape is two NOT NULL numeric(12,2) money columns.',
    ).toBe(true);
    expect(
      /\btotal\s*:\s*numeric\(/.test(src),
      'The `total` column is still defined in src/db/schema.ts. The contract step removes it — subtotal + tax are the only money columns.',
    ).toBe(false);
  });

  it('both money columns are NOT NULL', () => {
    const src = schema();
    const subtotalNotNull =
      /\bsubtotal\s*:\s*numeric\([^)]*\)[^,]*\.notNull\(\)/.test(src);
    const taxNotNull = /\btax\s*:\s*numeric\([^)]*\)[^,]*\.notNull\(\)/.test(
      src,
    );
    expect(
      subtotalNotNull && taxNotNull,
      'subtotal and tax must both be `.notNull()` — PR 2 promoted them; the contract step keeps them required.',
    ).toBe(true);
  });

  it('create and update accept subtotal + tax and reject total', () => {
    const src = actions();
    // Zod field declarations for the mutation schemas.
    expect(
      /\bsubtotal\s*:\s*z\./.test(src),
      'The create/update schemas in actions.ts do not accept `subtotal`. Mutations must accept the pair.',
    ).toBe(true);
    expect(
      /\btax\s*:\s*z\./.test(src),
      'The create/update schemas in actions.ts do not accept `tax`. Mutations must accept the pair.',
    ).toBe(true);
    expect(
      /\btotal\s*:\s*z\./.test(src),
      'A mutation schema in actions.ts still accepts `total`. The contract step drops `total` from both Zod schemas.',
    ).toBe(false);
  });

  it('writes persist subtotal + tax and never the total column', () => {
    const src = actions();
    expect(
      /\bsubtotal\s*:\s*input\.subtotal/.test(src),
      'The insert/update in actions.ts does not persist `subtotal`. Write the pair to the two columns.',
    ).toBe(true);
    expect(
      /\btax\s*:\s*input\.tax/.test(src),
      'The insert/update in actions.ts does not persist `tax`. Write the pair to the two columns.',
    ).toBe(true);
    // The transitional combined-amount write and the legacy-amount fallback both go.
    expect(
      /\btotal\s*:/.test(src),
      'A write in actions.ts still sets a `total` field. Drop the transitional `total: combinedAmount(...)` write (and the legacy-amount fallback) — the column is gone.',
    ).toBe(false);
    expect(
      /combinedAmount/.test(src),
      'actions.ts still references `combinedAmount`. The combined amount is no longer written to a column, so the helper has no place in the write path.',
    ).toBe(false);
  });
});

describe('Lesson 5 — req 3: reads return subtotal + tax directly, no coalesce fall-through', () => {
  it('InvoiceRow exposes the pair and drops the total field', () => {
    const src = queries();
    expect(
      /\bsubtotal\s*:\s*string/.test(src),
      'The InvoiceRow type in queries.ts does not surface `subtotal: string`. The read row carries the pair.',
    ).toBe(true);
    expect(
      /\btax\s*:\s*string/.test(src),
      'The InvoiceRow type in queries.ts does not surface `tax: string`. The read row carries the pair.',
    ).toBe(true);
    expect(
      /\btotal\s*:\s*string/.test(src),
      'The InvoiceRow type in queries.ts still has a `total: string` field. Drop it — the row returns the pair directly.',
    ).toBe(false);
  });

  it('the reads select the pair without a coalesce fall-through to total', () => {
    const src = queries();
    expect(
      /coalesce/i.test(src),
      'queries.ts still uses `coalesce`. The PR-2 dual-read fall-through (`coalesce(subtotal, total)`) is removed — select `invoices.subtotal` / `invoices.tax` directly.',
    ).toBe(false);
    expect(
      /invoices\.subtotal/.test(src) && /invoices\.tax/.test(src),
      'The list/detail reads in queries.ts do not select `invoices.subtotal` and `invoices.tax` directly.',
    ).toBe(true);
  });

  it('the amount sort orders on a derived expression, not a total column', () => {
    const src = queries();
    expect(
      /invoices\.total/.test(src),
      'queries.ts still references `invoices.total`. The `-total`/`total` sort can no longer order on a dropped column — order on `(subtotal + tax)` instead.',
    ).toBe(false);
  });
});

describe('Lesson 5 — req 4: the combined amount is computed, never read from a column', () => {
  it('combinedAmount derives subtotal + tax in exact cents', async () => {
    let mod: typeof import('@/lib/invoices/money');
    try {
      mod = await import('@/lib/invoices/money');
    } catch {
      throw new Error(
        'Could not import src/lib/invoices/money.ts. The combined amount must be a computed helper (`combinedAmount({ subtotal, tax })`), not a column read.',
      );
    }
    const { combinedAmount } = mod;
    expect(
      typeof combinedAmount,
      '`combinedAmount` is not exported from src/lib/invoices/money.ts.',
    ).toBe('function');

    // Happy path: it adds the pair and returns the numeric(12,2) string shape.
    expect(combinedAmount({ subtotal: '100.00', tax: '7.50' })).toBe('107.50');
    // The constraint this helper exists to teach: integer-cents arithmetic, no
    // float drift — 0.1 + 0.2 must not leak 0.30000000000000004.
    expect(combinedAmount({ subtotal: '0.10', tax: '0.20' })).toBe('0.30');
    // Edge: a zero-tax row still formats to two decimals.
    expect(combinedAmount({ subtotal: '42.00', tax: '0.00' })).toBe('42.00');
  });
});
