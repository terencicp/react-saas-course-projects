import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 2 — Ship to production (by-hand). The only on-disk artifact the student
// edits is the launch-checklist runbook; everything else is dashboard/CLI wiring
// the test cannot reach. This gate asserts the runbook's load-bearing structure:
// the eight checklist rows are filled (gesture + evidence) under the three section
// headers, and the scaffold TODO is gone. Node env, no DOM.
//
// Requirement covered:
//   1 [tested] — docs/runbooks/launch-checklist.md carries all eight checklist rows,
//               each filled with its gesture and evidence, under the three section headers.

// Read relative to the project root (tests/lessons/ is two levels down). Using a
// URL base keeps spaces in the path (".../Chapter 100/...") valid.
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const RUNBOOK = 'docs/runbooks/launch-checklist.md';

// The eight checks the lesson requires, each by a phrase that must survive in the
// filled runbook regardless of the student's own live evidence values.
const REQUIRED_CHECKS: { label: string; matcher: RegExp }[] = [
  { label: 'env validator', matcher: /env\s*validator/i },
  { label: '/api/health', matcher: /\/api\/health/i },
  { label: 'Sentry test error', matcher: /sentry/i },
  { label: 'branch-protected main', matcher: /branch[\s-]*protect/i },
  { label: 'the four-job CI gate', matcher: /\bci\b/i },
  { label: 'the Neon-branch-per-PR rehearsal', matcher: /neon/i },
  { label: 'the production alias', matcher: /alias/i },
  { label: 'the rollback rehearsal', matcher: /rollback/i },
];

// The three section headers the stub ships and the filled runbook must keep.
const REQUIRED_HEADERS = ['/api/health', 'Env validator', 'Sentry test error'];

describe('Lesson 2 — launch checklist runbook structure', () => {
  const source = readSource(RUNBOOK);

  it('has had its scaffold TODO removed (the runbook was actually filled)', () => {
    expect(
      /TODO\(L2\)/.test(source),
      'docs/runbooks/launch-checklist.md still contains the `TODO(L2)` scaffold comment. ' +
        'Fill the checklist and delete the TODO once every row is recorded.',
    ).toBe(false);
  });

  it('keeps the three section headers (/api/health, Env validator, Sentry test error)', () => {
    const headers = [...source.matchAll(/^\s*##\s+(.+?)\s*$/gm)].map(
      (m) => m[1],
    );
    for (const expected of REQUIRED_HEADERS) {
      expect(
        headers.some((h) => h.toLowerCase() === expected.toLowerCase()),
        `docs/runbooks/launch-checklist.md is missing the "## ${expected}" section header. ` +
          "Keep all three of the runbook's section headers when you fill it in.",
      ).toBe(true);
    }
  });

  it('fills the table with all eight checklist rows, each row complete across its four columns', () => {
    // Markdown table data rows: pipe-delimited lines that are not the header row
    // ("# / Check / Where / Evidence") and not the "| - | --- |" separator.
    const tableRows = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|') && line.endsWith('|'))
      .filter((line) => !/^\|[\s\-|]+\|$/.test(line)) // drop separator
      .filter(
        (line) => !/\bcheck\b/i.test(line) || !/\bevidence\b/i.test(line),
      ); // drop header

    expect(
      tableRows.length,
      `docs/runbooks/launch-checklist.md has ${tableRows.length} filled table row(s), ` +
        'but the launch checklist needs all eight rows recorded under the table header.',
    ).toBe(8);

    // Each row must carry four non-empty cells: nothing left as a placeholder dash.
    for (const row of tableRows) {
      const cells = row
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      expect(
        cells.length,
        `A launch-checklist table row does not have the four expected columns ` +
          `(# / Check / Where / Evidence): "${row}".`,
      ).toBe(4);
      expect(
        cells.every((cell) => cell.length > 0),
        `A launch-checklist table row has an empty cell — every row needs its ` +
          `gesture and evidence filled in: "${row}".`,
      ).toBe(true);
    }
  });

  it('names every one of the eight required checks somewhere in the runbook', () => {
    for (const { label, matcher } of REQUIRED_CHECKS) {
      expect(
        matcher.test(source),
        `docs/runbooks/launch-checklist.md does not mention the "${label}" check. ` +
          'All eight launch-checklist rows must be recorded.',
      ).toBe(true);
    }
  });
});
