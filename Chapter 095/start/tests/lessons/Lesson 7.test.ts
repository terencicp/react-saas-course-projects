import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 7 — the deliverable is the assembled findings/ artifacts plus the
// scored self-grade. These are markdown documents, so the gate reads their
// source shape (node env, no DOM): the coverage scorecard (SUMMARY.md), the
// deliberate-cuts record (out-of-scope.md), and the two bonus findings (009
// next/font + 010 composite index). Assertions target the observable *content*
// a finished document carries — a coverage count, the clause-by-clause rubric,
// the personal checklist, the rule/location/consequence/fix sections — not
// exact wording, so a valid differently-phrased write still passes while an
// unfilled placeholder fails.

// findings/ sits at the project root; this test file lives at tests/lessons/,
// so step up two levels to reach it. Keep the base a URL — a bare path is not
// a valid new URL() base, a directory URL is.
const findingsDir = new URL('../../findings/', import.meta.url);
const readFinding = (name: string) =>
  readFileSync(new URL(name, findingsDir), 'utf8');

// A placeholder section header with nothing under it ("## Rule\n\n## Location")
// is the unfilled-template signature. Return the body text that follows a given
// "## <heading>" up to the next "## " (or end of file), so we can assert the
// section was actually written, not just that the header survives.
const sectionBody = (markdown: string, heading: string): string => {
  const lines = markdown.split('\n');
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
  );
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end))
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '') // strip TODO comments — they are not content
    .trim();
};

// Requirement 4 — SUMMARY.md is the coverage-and-evidence artifact, not a list
// of titles: it carries a coverage count, a clause-by-clause rubric, the
// per-finding senior-reach detail, a personal checklist, and references both
// bonus findings.
describe('Requirement 4 — findings/SUMMARY.md is the coverage scorecard', () => {
  const summary = readFinding('SUMMARY.md');

  it('records a coverage count (e.g. 8/8 floor or 10/10 with bonuses)', () => {
    expect(
      /\b\d{1,2}\s*\/\s*(?:8|10)\b/.test(summary),
      'SUMMARY.md should state a coverage count like "8/8" or "10/10" — the floor is one finding per category, and the two bonus findings push it to 10/10. Add the count near the top of the Coverage section.',
    ).toBe(true);
  });

  it('scores findings clause by clause, not just pass/fail', () => {
    const scoresClauses =
      /partial[ -]credit/i.test(summary) && /\bhalf[ -]credit\b/i.test(summary);
    expect(
      scoresClauses,
      'SUMMARY.md should carry the clause-by-clause scoring rubric — score each finding on rule + location (the floor) and consequence + fix (the reach), naming where a match earns only partial/half credit. A bare list of finding titles is not a scorecard.',
    ).toBe(true);
  });

  it('carries the per-finding senior-reach detail across all eight findings', () => {
    // The reach is what the answer key names per finding; a finished scorecard
    // walks every finding number, not just a couple.
    const referenced = [
      '001',
      '002',
      '003',
      '004',
      '005',
      '006',
      '007',
      '008',
    ].filter((id) => summary.includes(id));
    expect(
      referenced.length,
      `SUMMARY.md should record the senior-reach detail for each of the eight in-scope findings (001–008); only [${referenced.join(', ')}] are referenced. List the reach per finding so you can self-grade against it.`,
    ).toBeGreaterThanOrEqual(8);
  });

  it('folds the discovery surfaces into a personal checklist', () => {
    const checkboxes = (summary.match(/^\s*-\s*\[\s?\]/gm) ?? []).length;
    expect(
      checkboxes,
      `SUMMARY.md should end with a personal diagnostic checklist of the per-category surfaces to re-run next pass (markdown "- [ ]" items); found ${checkboxes}. This is the portable artifact a senior re-runs each launch review.`,
    ).toBeGreaterThanOrEqual(5);
  });

  it('references both bonus findings — next/font and the composite index', () => {
    const namesNextFont =
      /next\/font/i.test(summary) || /\b009\b/.test(summary);
    const namesIndex =
      /composite\s+index/i.test(summary) ||
      /\bindex\b/i.test(summary) ||
      /\b010\b/.test(summary);
    expect(
      namesNextFont && namesIndex,
      'SUMMARY.md should reference both bonus findings — 009 (next/font on the marketing path) and 010 (the missing composite index) — as the reach above the 8/8 floor that pushes coverage to 10/10.',
    ).toBe(true);
  });
});

// Requirement 5 — out-of-scope.md records the deliberate cuts: at least one
// observation that falls outside the eight audit categories.
describe('Requirement 5 — findings/out-of-scope.md records a deliberate cut', () => {
  const outOfScope = readFinding('out-of-scope.md');

  it('records at least one substantive out-of-category observation', () => {
    // The placeholder is a lone "# Out of scope" heading plus a TODO comment.
    // A real observation is a bullet with a meaningful body under it.
    const body = outOfScope.replace(/<!--[\s\S]*?-->/g, '').trim();
    const bullets = (body.match(/^\s*[-*]\s+\S/gm) ?? []).length;
    expect(
      bullets,
      `out-of-scope.md should record at least one observation that falls outside the eight audit categories (a deliberate cut a future pass may pick up), written as a bullet; found ${bullets}. The empty template does not count.`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      body.length,
      'out-of-scope.md is still effectively empty — write down the out-of-category observation(s) so the scorecard count stays clean and the next pass inherits the context.',
    ).toBeGreaterThan(120);
  });
});

// Requirement 6 — bonus finding 009 names the raw <link> font on the marketing
// layout with the rule-location-consequence-fix template.
describe('Requirement 6 — findings/009-missing-next-font.md', () => {
  const finding = readFinding('009-missing-next-font.md');

  it('fills all four template sections (rule, location, consequence, fix)', () => {
    for (const section of ['Rule', 'Location', 'Consequence', 'Fix']) {
      expect(
        sectionBody(finding, section).length,
        `Finding 009's "## ${section}" section is empty — fill the rule-location-consequence-fix template (the TODO comment is not content).`,
      ).toBeGreaterThan(20);
    }
  });

  it('names the raw <link> font on the marketing layout and the next/font fix', () => {
    expect(
      /<link/i.test(finding) && /next\/font/i.test(finding),
      'Finding 009 should name the raw <link> Google-font request and prescribe next/font (self-hosting) as the fix on the marketing layout.',
    ).toBe(true);
    expect(
      /marketing/i.test(finding),
      'Finding 009 should locate the defect on the marketing layout — the unauthenticated first-impression route on the LCP path.',
    ).toBe(true);
  });

  it('declares a justified severity', () => {
    expect(
      /\*\*Severity:\*\*\s*\S/i.test(finding),
      'Finding 009 should fill the Severity line — a render-blocking third-party font on the LCP path with a font-swap reflow risk is the medium-severity call.',
    ).toBe(true);
  });
});

// Requirement 7 — bonus finding 010 names the missing composite (org_id,
// created_at) index on invoices, proven with EXPLAIN ANALYZE, with the
// migration actually generated (not merely named).
describe('Requirement 7 — findings/010-composite-index.md', () => {
  const finding = readFinding('010-composite-index.md');

  it('fills all four template sections (rule, location, consequence, fix)', () => {
    for (const section of ['Rule', 'Location', 'Consequence', 'Fix']) {
      expect(
        sectionBody(finding, section).length,
        `Finding 010's "## ${section}" section is empty — fill the rule-location-consequence-fix template (the TODO comment is not content).`,
      ).toBeGreaterThan(20);
    }
  });

  it('names the missing composite (org_id, created_at) index on invoices', () => {
    const namesComposite =
      /composite/i.test(finding) &&
      /organization_id|org_id/i.test(finding) &&
      /created_at/i.test(finding);
    expect(
      namesComposite,
      'Finding 010 should name the missing composite index on invoices — leftmost-prefix organization_id then created_at (then id) — that serves the org-scoped, createdAt-ordered dashboard read.',
    ).toBe(true);
  });

  it('proves it with EXPLAIN ANALYZE — Seq Scan + in-memory Sort flipping to Index Scan', () => {
    const provenByPlan =
      /EXPLAIN ANALYZE/i.test(finding) &&
      /Seq\s*Scan/i.test(finding) &&
      /Sort/i.test(finding) &&
      /Index\s*Scan/i.test(finding);
    expect(
      provenByPlan,
      'Finding 010 should prove the defect with EXPLAIN ANALYZE — the Seq Scan + in-memory Sort fingerprint that flips to an Index Scan once the composite index exists. The query plan is the diagnostic surface for a missing index.',
    ).toBe(true);
  });

  it('names the migration as actually generated, not just the index declaration', () => {
    // The senior reach is two halves: declare the index AND generate the
    // migration — declaring it in the schema changes nothing until the
    // migration runs. Naming the index without generating the migration is
    // the named half-credit miss.
    const namesGeneratedMigration =
      /migration/i.test(finding) &&
      (/drizzle-kit/i.test(finding) ||
        /db:generate/i.test(finding) ||
        /generate/i.test(finding));
    expect(
      namesGeneratedMigration,
      'Finding 010 should name the generated migration (drizzle-kit / pnpm db:generate) as the load-bearing second half of the fix — declaring the index without generating the migration is half-credit, because the schema line changes nothing until the migration runs.',
    ).toBe(true);
  });
});
