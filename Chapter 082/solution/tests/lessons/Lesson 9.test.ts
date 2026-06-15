import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 9 — Finding 008 — the GDPR deletion gap (lib/account/delete-account.ts).
//
// The deliverable is a written audit finding, not source code. This gate is
// self-contained: it imports only vitest + node:fs and reads the committed artifacts
// off disk (the target's server-only / 'use server' modules would not load in the
// node test env anyway). It asserts the OBSERVABLE SHAPE of the finding the student
// writes (findings/008-gdpr-deletion.md) PLUS a source-shape probe that the seeded
// defect is still present — the audit target is read-only, so a passing gate proves
// the student documented the defect rather than patching it.
//
// Keep the path base a URL (never fileURLToPath it): a file: URL is a valid
// new URL() base and tolerates the space in the "Chapter 082" segment; a bare path
// would throw "Invalid URL".
const fromRoot = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const FINDING = 'findings/008-gdpr-deletion.md';
const TARGET = 'src/lib/account/delete-account.ts';

const finding = (() => {
  try {
    return fromRoot(FINDING);
  } catch {
    return '';
  }
})();

// Body text under a `## Header`, up to the next `## ` header or end of file. Returns
// '' when the header is missing or carries no content. HTML comments are stripped so
// the skeleton's leftover TODO never counts as "populated" content.
const sectionBody = (md: string, header: string): string => {
  const lines = md.split('\n');
  const start = lines.findIndex(
    (l) => l.trim().toLowerCase() === `## ${header}`.toLowerCase(),
  );
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  return body.replace(/<!--[\s\S]*?-->/g, '').trim();
};

describe('Lesson 9 — Finding 008 — the GDPR deletion gap', () => {
  it('finding file exists and is readable', () => {
    expect(
      finding,
      `Could not read ${FINDING}. Write the finding there — the audit deliverable for this lesson lives in findings/008-gdpr-deletion.md.`,
    ).not.toBe('');
  });

  // Requirement 1: all four template sections are filled with real content.
  describe('the four template sections are populated (req 1)', () => {
    for (const header of ['Rule', 'Location', 'Consequence', 'Fix']) {
      it(`## ${header} carries real content`, () => {
        const body = sectionBody(finding, header);
        expect(
          body.length,
          `The "## ${header}" section in ${FINDING} is empty (or only the skeleton TODO remains). Fill it in following findings/template.md.`,
        ).toBeGreaterThan(20);
      });
    }
  });

  // Requirement 2: the Rule names the GDPR-deletion rule — the async deletion job and
  // the "anonymize the audit log, don't hard-delete it" tension — linked to ch081 L4.
  describe('the Rule names the GDPR-deletion rule and cites ch081 L4 (req 2)', () => {
    it('names the async deletion job as the shape an erasure request takes', () => {
      const rule = sectionBody(finding, 'Rule').toLowerCase();
      expect(
        rule,
        'The "## Rule" section must name that a GDPR erasure request runs as an async deletion job that walks the full retention catalog — not an inline DELETE.',
      ).toMatch(/async|job|deletion job|trigger/);
    });

    it('names the anonymize-not-hard-delete rule for the audit trail', () => {
      const rule = sectionBody(finding, 'Rule').toLowerCase();
      expect(
        rule,
        'The "## Rule" section must name the audit-trail rule: the append-only audit log is ANONYMIZED, never hard-deleted. This is the senior point the finding exists to teach.',
      ).toMatch(/anonymi[sz]/);
    });

    it('links the source rule (chapter 081 lesson 4)', () => {
      const rule = sectionBody(finding, 'Rule').toLowerCase();
      expect(
        rule,
        'The "## Rule" section must cite where the rule comes from — chapter 081, lesson 4 (the retention catalog and the three deletion shapes) — linked by section.',
      ).toMatch(/081[\s\S]*lesson\s*4|081[\s\S]*l\s*4|lesson\s*4[\s\S]*081/);
    });
  });

  // Requirement 3: the Location pins the one-row delete to the file, a line range,
  // and the grep/read command(s) that surfaced it.
  describe('the Location names the one-row delete with evidence (req 3)', () => {
    it('names the audit target file', () => {
      const loc = sectionBody(finding, 'Location');
      expect(
        loc,
        'The "## Location" section must name the file the defect lives in: src/lib/account/delete-account.ts.',
      ).toMatch(/delete-account\.ts/);
    });

    it('names a line range for the one-row delete', () => {
      const loc = sectionBody(finding, 'Location');
      // A line range reads like "21-25" or "21–25" (hyphen or en dash) or "line 21".
      expect(
        loc,
        'The "## Location" section must pin the defect to a line range (e.g. lines 21-25) — a finding locates the statement, not just the file.',
      ).toMatch(/\d+\s*[-–]\s*\d+|lines?\s*\d+/i);
    });

    it('names a grep/read command that surfaced it', () => {
      const loc = sectionBody(finding, 'Location').toLowerCase();
      expect(
        loc,
        'The "## Location" section must name the command that surfaced the defect (e.g. an rg/grep over delete( or references(() => user.id)). A finding names how it was found, never a bare opinion.',
      ).toMatch(/\b(rg|grep)\b/);
    });
  });

  // Requirement 8: the audit target is unchanged — the seeded one-row delete is still
  // the entire body of deleteAccount. A source-shape probe proves the student
  // documented the defect rather than patching it.
  describe('the audit target still ships the seeded one-row delete (req 8)', () => {
    const target = (() => {
      try {
        return fromRoot(TARGET);
      } catch {
        return '';
      }
    })();

    it('delete-account.ts is present', () => {
      expect(
        target,
        `Could not read ${TARGET}. The audit target is read-only — do not move or delete it.`,
      ).not.toBe('');
    });

    it('deleteAccount still deletes only the users row (defect intact)', () => {
      // Normalize whitespace so formatting differences do not matter. The seeded
      // defect is the single `db.delete(users).where(eq(users.id, userId))`.
      const flat = target.replace(/\s+/g, ' ');
      expect(
        /db\.delete\(users\)\.where\(\s*eq\(users\.id,\s*userId\)\s*\)/.test(
          flat,
        ),
        'The seeded one-row delete (db.delete(users).where(eq(users.id, userId))) is gone from src/lib/account/delete-account.ts. The target is read-only — document the defect in the finding, do not patch it.',
      ).toBe(true);
    });

    it('deleteAccount still walks no further than the users row (defect intact)', () => {
      // A "fix" would add deletes against the data graph the finding enumerates
      // (member / invitation / invoice_notes / exports / sessions) or anonymize the
      // audit log. None of those tables may appear in the read-only target's body —
      // the comment block names them, so probe the executable body only.
      const body = target.slice(target.indexOf('export const deleteAccount'));
      const flat = body.replace(/\s+/g, ' ');
      expect(
        /\b(member|invitation|invoiceNotes|invoice_notes|exports|auditLogs|audit_logs|session)\b/.test(
          flat,
        ),
        'src/lib/account/delete-account.ts now touches the wider data graph — that is the FIX, not the seeded state. The target is read-only; enumerate the missed tables in the finding instead, do not patch the handler.',
      ).toBe(false);
    });
  });
});
