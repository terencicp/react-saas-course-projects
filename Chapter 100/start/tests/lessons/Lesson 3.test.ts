import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 3 — PR 1 (Expand): add the nullable subtotal + tax columns and generate
// the additive migration.
//
// The expand step is a schema-only change: widen `invoices` so the old combined
// `total` and the new `subtotal`/`tax` shapes coexist, touching no app code and
// rewriting no rows. The single observable that proves the whole safety argument is
// the migration Drizzle Kit emits — a metadata-only pair of nullable `ADD COLUMN`s.
// So these are source-shape probes over the generated `drizzle/*.sql`, never path or
// import assertions. The deploy / preview-log / Sentry / runbook outcomes are the
// [untested] requirements confirmed by hand in "Moment of truth".
//
// Self-contained: imports nothing but `vitest` + node built-ins and inlines its own
// readers. It deliberately scopes to the *expand* migration (the one that introduces
// subtotal + tax) rather than every file in drizzle/, so the later PR-2/PR-3
// migrations (SET NOT NULL, DROP total) never bleed into the additive check.

// Project root is two levels up from tests/lessons/. Keep the base a URL so a path
// with spaces resolves (a bare path is not a valid `new URL()` base).
const ROOT = new URL('../../', import.meta.url);

// All generated migration SQL files, sorted by filename (0000, 0001, …). Returns []
// when drizzle/ has no .sql files yet, so a missing migration fails a named assertion
// rather than crashing the run.
const migrationFiles = (): { name: string; sql: string }[] => {
  let names: string[];
  try {
    names = readdirSync(new URL('drizzle/', ROOT));
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(new URL(`drizzle/${name}`, ROOT), 'utf8'),
    }));
};

// The expand migration: the generated file that introduces BOTH new money columns
// via ADD COLUMN. Identified by behavior (what it does), not by its 0005 filename.
const expandMigration = (): { name: string; sql: string } | null => {
  const addsCol = (sql: string, col: string) =>
    new RegExp(`add\\s+column\\s+"?${col}"?`, 'i').test(sql);
  return (
    migrationFiles().find(
      (m) => addsCol(m.sql, 'subtotal') && addsCol(m.sql, 'tax'),
    ) ?? null
  );
};

describe('Lesson 3 — expand: nullable subtotal + tax + additive migration', () => {
  // ── Req 1 ──────────────────────────────────────────────────────────────────────
  // The migration is additive only — it adds the two columns and contains no DROP,
  // no NOT NULL add, no RENAME. This is what lets it deploy against the live app with
  // no incompatibility window.
  describe('Req 1 — the expand migration is additive only', () => {
    it('generates a migration that adds the subtotal and tax columns', () => {
      const files = migrationFiles();
      expect(
        files.length,
        'No migration files found under drizzle/. Add subtotal + tax to src/db/schema.ts, then run `pnpm db:generate` to emit the expand migration.',
      ).toBeGreaterThan(0);
      expect(
        expandMigration(),
        'No generated migration adds BOTH `subtotal` and `tax` columns. After adding the two nullable columns to the schema, run `pnpm db:generate` — Drizzle Kit emits a `0005_expand_subtotal_tax.sql` with two `ALTER TABLE "invoices" ADD COLUMN` statements.',
      ).not.toBeNull();
    });

    it('contains no DROP — the expand step removes nothing', () => {
      const sql = expandMigration()?.sql ?? '';
      expect(
        /\bdrop\b/i.test(sql),
        'The expand migration must not DROP anything. Dropping the old `total` column is PR 3 (Lesson 5) — expand only widens the schema so old and new shapes coexist.',
      ).toBe(false);
    });

    it('does not promote the new columns to NOT NULL', () => {
      const sql = expandMigration()?.sql ?? '';
      expect(
        /not\s+null/i.test(sql),
        'The expand migration must not add NOT NULL. A NOT NULL add fails against the existing rows that have no subtotal/tax value yet — the promotion is deferred to PR 2 (Lesson 4), after the backfill.',
      ).toBe(false);
    });

    it('contains no RENAME — the columns are added, not renamed', () => {
      const sql = expandMigration()?.sql ?? '';
      expect(
        /\brename\b/i.test(sql),
        'The expand migration must not RENAME. `total` stays in place untouched; `subtotal`/`tax` are brand-new ADD COLUMNs alongside it.',
      ).toBe(false);
    });
  });

  // ── Req 2 ──────────────────────────────────────────────────────────────────────
  // Both new columns are nullable and declared numeric(12, 2), matching `total`'s
  // precision and scale. Nullability is the entire safety argument; a precision
  // mismatch is a quiet money-corruption source.
  describe('Req 2 — both columns are nullable numeric(12, 2) matching total', () => {
    it('declares both subtotal and tax as numeric(12, 2)', () => {
      const sql = expandMigration()?.sql ?? '';
      for (const col of ['subtotal', 'tax']) {
        const addsTyped = new RegExp(
          `add\\s+column\\s+"?${col}"?\\s+numeric\\s*\\(\\s*12\\s*,\\s*2\\s*\\)`,
          'i',
        ).test(sql);
        expect(
          addsTyped,
          `\`${col}\` must be added as numeric(12, 2) — copy \`total\`'s precision and scale exactly. A mismatched precision silently corrupts money. (Use \`numeric('${col}', { precision: 12, scale: 2 })\` in the schema.)`,
        ).toBe(true);
      }
    });

    it('leaves both new columns nullable — no NOT NULL on either ADD COLUMN', () => {
      const sql = expandMigration()?.sql ?? '';
      for (const col of ['subtotal', 'tax']) {
        // Isolate just this column's ADD COLUMN statement, up to the breakpoint or end.
        const stmt =
          sql
            .split(/-->\s*statement-breakpoint|;/i)
            .find((s) =>
              new RegExp(`add\\s+column\\s+"?${col}"?`, 'i').test(s),
            ) ?? '';
        expect(
          /not\s+null/i.test(stmt),
          `\`${col}\` must be nullable — omit \`.notNull()\` in the schema. Nullability is the whole safety argument: the running app does not read ${col}, and a NOT NULL add would fail against the existing rows that have no value.`,
        ).toBe(false);
      }
    });
  });
});
