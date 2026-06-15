import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 6 — Rollback rehearsal and the schema caveat.
//
// The only artifact that changes on disk is docs/runbooks/rollback.md. Every Vercel/
// Neon/Sentry gesture is by-hand and unreachable from a node test, so this gate asserts
// exactly one thing: that the runbook the future 2 AM on-call engineer will read carries
// its load-bearing structure. It reads the markdown file as text and checks for the four
// sections, the surviving caveat, and both named recovery paths. Node env, no DOM.

const runbook = (() => {
  try {
    return readFileSync(
      new URL('../../docs/runbooks/rollback.md', import.meta.url),
      'utf8',
    );
  } catch {
    return '';
  }
})();

// Strip code fences so a section header that happens to appear inside an example block
// (e.g. a pasted shell transcript) does not count as the runbook's own structure.
const prose = runbook.replace(/```[\s\S]*?```/g, '');

// A "## Heading" counts as filled only if it carries body text before the next "## ".
// Split on the "##" markers, find the chunk whose first line matches the heading, then
// drop that first (heading) line and check what prose remains underneath it.
const sectionHasBody = (heading: RegExp): boolean => {
  const chunks = prose.split(/^##\s+/m);
  const section = chunks.find((chunk) => {
    // Strip inline-code backticks so a header like "The `git revert` follow-up"
    // matches a plain-text regex (the stub ships that heading with backticks).
    const firstLine = (chunk.split('\n', 1)[0] ?? '').replace(/`/g, '');
    return heading.test(firstLine);
  });
  if (!section) return false;
  const body = section.split('\n').slice(1).join('\n').trim();
  return body.length > 0;
};

describe('Lesson 6 — rollback runbook structure', () => {
  it('the runbook file exists and is not empty', () => {
    expect(
      runbook.trim().length,
      'docs/runbooks/rollback.md is missing or empty — this is the only artifact the lesson produces.',
    ).toBeGreaterThan(0);
  });

  // Requirement 1 — the four load-bearing sections, each filled with guidance, not a
  // bare header. The stub ships these three headers empty plus the pre-written caveat;
  // the lesson is to write the gesture under each.
  describe('the four sections the on-call engineer reads', () => {
    it('the four-step alias re-point gesture is written out, not a bare header', () => {
      expect(
        sectionHasBody(/four-step alias re-?point/i),
        'The "## The four-step alias re-point" section is missing or has no body — write the dashboard gesture (identify previous green prod, promote, verify, the caveat reminder).',
      ).toBe(true);
    });

    it('the git revert follow-up section is written out', () => {
      expect(
        sectionHasBody(/git revert follow-?up/i),
        'The "## The `git revert` follow-up" section is missing or has no body — name the revert-PR gesture that ships the rolled-back code on the next deploy.',
      ).toBe(true);
    });

    it('the re-enable auto-assignment section is written out', () => {
      expect(
        sectionHasBody(/re-?enabl\w* auto-?assignment/i),
        'The "## Re-enabling auto-assignment" section is missing or has no body — explain re-enabling auto-assignment from the new prod deployment after a smoke test.',
      ).toBe(true);
    });

    it('the bolded "does not undo migrations" caveat survives', () => {
      // The caveat ships pre-written and bolded; it must still be there and still bold.
      const boldRuns = runbook.match(/\*\*(.+?)\*\*/gs) ?? [];
      const caveatStillBold = boldRuns.some((run) =>
        /does\s+not\s+undo|alias\s+re-?point\s+does\s+not/i.test(run),
      );
      expect(
        caveatStillBold,
        'The bolded forward-only-migration caveat ("an alias re-point does NOT undo a migration") is gone or no longer bold — it must survive as the runbook\'s sharpest warning.',
      ).toBe(true);
    });
  });

  // Requirement 2 — the discriminator: the runbook must name both recovery paths so the
  // 2 AM engineer can tell an application-bug rollback from a schema mistake.
  describe('the application-bug vs schema-mistake discriminator', () => {
    it('names the code-only git revert path for an application bug', () => {
      expect(
        /git revert/i.test(prose),
        'The runbook never mentions `git revert` — the application-bug recovery path (alias re-point + code-only revert, schema untouched) must be named.',
      ).toBe(true);
    });

    it('names the forward-fix migration path for a schema mistake', () => {
      const forwardFix =
        /GENERATED\s+ALWAYS/i.test(prose) ||
        /forward-?fix\s+migration/i.test(prose);
      expect(
        forwardFix,
        'The runbook never names the schema-mistake recovery path — reference the forward-fix migration (e.g. re-adding total as GENERATED ALWAYS AS (subtotal + tax) STORED), the move an alias re-point cannot perform.',
      ).toBe(true);
    });
  });
});
