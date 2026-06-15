import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 2 — Finding 001 — the fail-closed bypass (lib/admin/transfer-ownership.ts).
//
// The deliverable is a written audit finding, not source code. This gate asserts
// the OBSERVABLE SHAPE of `findings/001-fail-closed.md` (the four template sections
// are populated, the fail-closed rule is named, the Location names a command/file,
// and the Fix names the senior reach) PLUS a source-shape probe that the seeded
// defect is still present — the audit target is read-only, so a passing gate proves
// the student documented the defect rather than patching it.
//
// Self-contained: reads files off disk; imports nothing from the app (the target's
// 'use server' / server-only modules would not load in the node test env anyway).

// Resolve paths relative to this test file's location. Keep the base a URL — a bare
// path is not a valid `new URL()` base; a file: URL is, and it handles spaces in the
// "Chapter 082" path segment.
const readRepo = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const FINDING = 'findings/001-fail-closed.md';
const TARGET = 'src/lib/admin/transfer-ownership.ts';

const finding = (() => {
  try {
    return readRepo(FINDING);
  } catch {
    return '';
  }
})();

// Body text under a `## Header`, up to the next `## ` header or end of file.
// Empty string when the header is missing or carries no content.
const sectionBody = (md: string, header: string): string => {
  const lines = md.split('\n');
  const start = lines.findIndex(
    (l) => l.trim().toLowerCase() === `## ${header}`.toLowerCase(),
  );
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  // Strip HTML comments (the skeleton's TODO lives in one) so a leftover TODO
  // never counts as "populated".
  return body.replace(/<!--[\s\S]*?-->/g, '').trim();
};

describe('Lesson 2 — Finding 001 — the fail-closed bypass', () => {
  it('finding file exists and is readable', () => {
    expect(
      finding,
      `Could not read ${FINDING}. Write the finding there — the audit deliverable lives in findings/001-fail-closed.md.`,
    ).not.toBe('');
  });

  // Requirement 6 (structural half): all four template sections filled.
  describe('the four template sections are populated (req 6)', () => {
    for (const header of ['Rule', 'Location', 'Consequence', 'Fix']) {
      it(`## ${header} carries real content`, () => {
        const body = sectionBody(finding, header);
        expect(
          body.length,
          `The "## ${header}" section in ${FINDING} is empty (or only the TODO comment remains). Fill it in following findings/template.md.`,
        ).toBeGreaterThan(20);
      });
    }
  });

  // Requirement 2: the finding names the rule as fail-closed (chapter 080 lesson 1).
  describe('the rule is named as fail-closed, ch080 L1 (req 2)', () => {
    it('the Rule section names "fail-closed"', () => {
      const rule = sectionBody(finding, 'Rule').toLowerCase();
      expect(
        rule,
        'The "## Rule" section must name the rule as fail-closed (the defect class this finding documents).',
      ).toMatch(/fails?[\s-]?closed/);
    });

    it('the Rule section links the source lesson (chapter 080 lesson 1)', () => {
      const rule = sectionBody(finding, 'Rule').toLowerCase();
      expect(
        rule,
        'The "## Rule" section must cite where the rule comes from — chapter 080, lesson 1.',
      ).toMatch(/080.*lesson\s*1|080.*l\s*1|chapter\s*080/);
    });
  });

  // Requirement 5 (structural half): a severity is assigned.
  describe('a severity is assigned (req 5)', () => {
    it('Severity names one of critical/high/medium/low as the chosen value', () => {
      // The template line reads "**Severity:** <one of the four>". A populated
      // finding picks ONE — not the unedited "critical | high | medium | low" menu.
      const line = finding
        .split('\n')
        .find((l) => /\*\*severity:?\*\*/i.test(l));
      expect(
        line,
        `${FINDING} is missing a "**Severity:**" line. Assign a severity and justify it.`,
      ).toBeTruthy();
      const value = (line ?? '').replace(/.*severity:?\*\*/i, '').trim();
      expect(
        value.includes('|'),
        'Severity still shows the template menu "critical | high | medium | low". Pick one severity and justify it in two lines.',
      ).toBe(false);
      expect(
        value.toLowerCase(),
        'Severity must be one of critical / high / medium / low.',
      ).toMatch(/critical|high|medium|low/);
    });
  });

  // Tested observable: Location names the command(s) that surfaced the defect and
  // the target file — never a bare "code review opinion".
  describe('the Location names a command and the target file', () => {
    it('names the audit target file path', () => {
      const loc = sectionBody(finding, 'Location');
      expect(
        loc,
        'The "## Location" section must name the file the defect lives in: src/lib/admin/transfer-ownership.ts.',
      ).toMatch(/transfer-ownership\.ts/);
    });

    it('names a grep command that surfaced it', () => {
      const loc = sectionBody(finding, 'Location').toLowerCase();
      expect(
        loc,
        'The "## Location" section must name the command that surfaced the defect (e.g. an rg/grep on requireRole). A finding names how it was found, never a bare opinion.',
      ).toMatch(/\b(rg|grep)\b/);
    });
  });

  // Tested observable: the Fix names the senior reach — let authedAction convert the
  // throw — and does NOT prescribe a re-throw inside the catch.
  describe('the Fix names the senior reach (authedAction conversion)', () => {
    it('names the authedAction wrapper as the boundary that converts the throw', () => {
      const fix = sectionBody(finding, 'Fix');
      expect(
        fix,
        'The "## Fix" section must name the senior reach: let the throw reach the authedAction wrapper, which converts it to an unauthorized refusal. Remove the try/catch rather than catching.',
      ).toMatch(/authedAction/);
    });

    it('does not prescribe re-throwing inside a catch', () => {
      const fix = sectionBody(finding, 'Fix').toLowerCase();
      // The trap: "re-throw inside the catch" instead of removing the catch. The
      // solution explicitly warns against it; a fix that prescribes it is wrong.
      const prescribesRethrow =
        /catch[\s\S]{0,60}\bthrow\b/.test(fix) &&
        !/(do not|don't|never|not)\b[\s\S]{0,40}(re-?throw|throw)/.test(fix);
      expect(
        prescribesRethrow,
        'The Fix should remove the try/catch and let the wrapper own conversion, not re-throw inside the catch. The call site holds no error-handling machinery.',
      ).toBe(false);
    });
  });

  // Requirement 6 (source-shape half): the audit target is unchanged — the seeded
  // fail-open try/catch around requireRole('owner') is still present at both sites.
  describe('the audit target still ships the seeded defect (req 6)', () => {
    const target = (() => {
      try {
        return readRepo(TARGET);
      } catch {
        return '';
      }
    })();

    it('transfer-ownership.ts is present', () => {
      expect(
        target,
        `Could not read ${TARGET}. The audit target is read-only — do not move or delete it.`,
      ).not.toBe('');
    });

    it('still wraps requireRole in a swallowing try/catch (defect intact)', () => {
      // Normalize whitespace so formatting differences do not matter.
      const flat = target.replace(/\s+/g, ' ');
      const occurrences = (
        flat.match(/try\s*\{\s*await requireRole\('owner'\)/g) ?? []
      ).length;
      expect(
        occurrences,
        "The seeded fail-open try/catch around requireRole('owner') is gone from src/lib/admin/transfer-ownership.ts. The target is read-only — document the defect in the finding, do not patch it.",
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
