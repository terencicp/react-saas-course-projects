import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 3 — Finding 002 — the dangerouslySetInnerHTML XSS sink (invoices/[id]/notes.tsx).
//
// This is a finding-writing lesson: the deliverable is the Markdown report
// `findings/002-xss-html-sink.md`, written against the report template. The audit
// target is read-only — the student documents the seeded defect, never patches it.
//
// Self-contained: this file inlines its own readers and imports nothing but `vitest`
// and node built-ins. It asserts the OBSERVABLE shape of the student's deliverable
// (the finding's prose) and a source-shape probe that the seeded sink is untouched.
// It deliberately does NOT check headings as exact strings or assert file/function
// names of the student's writing — only the content a complete finding must carry.

// Read a project file relative to the project root (two levels up from tests/lessons/).
// Keep the base as a URL (never fileURLToPath it) so paths with spaces resolve.
const readProjectFile = (rel: string): string =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const FINDING_PATH = 'findings/002-xss-html-sink.md';
const SINK_PATH = 'src/app/(protected)/invoices/[id]/notes.tsx';

const finding = (): string => {
  try {
    return readProjectFile(FINDING_PATH);
  } catch {
    throw new Error(
      `Could not read ${FINDING_PATH}. Write your finding into that file (it ships as a 4-section skeleton).`,
    );
  }
};

// Split the finding into its template sections keyed by ## heading. Returns the body
// text under each `## <Name>` heading (lower-cased keys), so we can assert each
// section is actually populated rather than left as an empty skeleton heading.
const sections = (md: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const parts = md.split(/^##\s+/m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf('\n');
    const name = (newline === -1 ? part : part.slice(0, newline))
      .trim()
      .toLowerCase();
    const body = newline === -1 ? '' : part.slice(newline + 1);
    // Strip HTML comments (the TODO skeleton lives in one) before measuring content.
    out[name] = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  return out;
};

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ');

describe('Lesson 3 — Finding 002 — the XSS HTML sink', () => {
  // Req 1 — the four template sections (Rule, Location, Consequence, Fix) are all populated.
  describe('Req 1 — the finding carries all four populated template sections', () => {
    it('has a Rule, Location, Consequence, and Fix section, none left empty', () => {
      const s = sections(finding());
      for (const name of ['rule', 'location', 'consequence', 'fix']) {
        expect(
          name in s,
          `findings/002-xss-html-sink.md is missing the "## ${name.charAt(0).toUpperCase()}${name.slice(1)}" section — keep all four template headings.`,
        ).toBe(true);
        expect(
          (s[name] ?? '').length,
          `The "${name}" section is empty. The skeleton ships with bare headings; write the ${name} content under it.`,
        ).toBeGreaterThan(40);
      }
    });
  });

  // Req 2 — names the XSS / operator-trustworthiness rule, linked to its source lessons.
  describe('Req 2 — the named rule, linked to its source lessons', () => {
    it('names the operator-trustworthiness / sanitization rule', () => {
      const body = norm(sections(finding()).rule ?? '');
      const namesRule =
        body.includes('sanitiz') ||
        body.includes('operator-trustworthy') ||
        body.includes('operator trustworthy');
      expect(
        namesRule,
        'The Rule section should name the rule itself — user-submitted content is not operator-trustworthy and must be sanitized — not just describe the symptom.',
      ).toBe(true);
    });

    it('cites the source lessons (chapter 080 lesson 2 and chapter 081 lesson 1)', () => {
      const body = norm(sections(finding()).rule ?? '');
      const cites080 = /080.*lesson\s*2|080.*l\s*2|chapter\s*080.*2/.test(body);
      const cites081 = /081.*lesson\s*1|081.*l\s*1|chapter\s*081.*1/.test(body);
      expect(
        cites080 && cites081,
        'The Rule must link its source lessons by id: chapter 080 lesson 2 (operator-trustworthiness) and chapter 081 lesson 1 (CSP baseline).',
      ).toBe(true);
    });
  });

  // Req 3 — the Location names the grep command and the file + line range it surfaced.
  describe('Req 3 — the Location names the grep command and the file it surfaced', () => {
    it('names the dangerouslySetInnerHTML grep across src', () => {
      const body = norm(sections(finding()).location ?? '');
      expect(
        body.includes('dangerouslysetinnerhtml'),
        'The Location should name the command that surfaced the sink — grep/rg for `dangerouslySetInnerHTML` across src.',
      ).toBe(true);
    });

    it('names the sink file and a line reference', () => {
      const body = sections(finding()).location ?? '';
      expect(
        /notes\.tsx/.test(body),
        'The Location should name the file the grep hit: src/app/(protected)/invoices/[id]/notes.tsx.',
      ).toBe(true);
      expect(
        /\bline\b|:\d|lines?\s*\d/i.test(body),
        'The Location should pin the sink to a line (or line range), e.g. "notes.tsx:37".',
      ).toBe(true);
    });
  });

  // Req 4 — the Fix names the senior reach: sanitize at write AND read, store the sanitized output.
  describe('Req 4 — the Fix names the senior reach (sanitize at write and read)', () => {
    it('names sanitization at both the write and the read seam', () => {
      const body = norm(sections(finding()).fix ?? '');
      expect(
        body.includes('write') && body.includes('read'),
        'The Fix must name sanitizing at write AND at read — write-only leaves historical rows raw.',
      ).toBe(true);
      expect(
        body.includes('sanitiz'),
        'The Fix should name the sanitization step (e.g. DOMPurify on the note body).',
      ).toBe(true);
    });

    it('states the sanitized output is stored', () => {
      const body = norm(sections(finding()).fix ?? '');
      const storesClean =
        body.includes('store') ||
        body.includes('stored') ||
        body.includes('persist');
      expect(
        storesClean,
        'The Fix should say the sanitized output is stored (not just rendered), so the safe form is what lives in the column.',
      ).toBe(true);
    });
  });

  // Req 5 — source-shape probe: the seeded sink is still present (read-only audit).
  describe('Req 5 — the seeded sink is still present (the audit is read-only)', () => {
    it('still renders note.body through dangerouslySetInnerHTML in notes.tsx', () => {
      let src: string;
      try {
        src = readProjectFile(SINK_PATH);
      } catch {
        throw new Error(
          `Could not read ${SINK_PATH}. The audit target is read-only — do not move or delete it.`,
        );
      }
      const stripped = src.replace(/\s+/g, '');
      expect(
        stripped.includes('dangerouslySetInnerHTML={{__html:note.body}}'),
        'The seeded sink in notes.tsx must stay untouched. This is a read-only audit — document the defect in the finding, do not patch the component.',
      ).toBe(true);
    });
  });
});
