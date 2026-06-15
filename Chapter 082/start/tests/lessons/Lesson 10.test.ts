import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 10 — Commit and self-grade — SUMMARY.md + out-of-scope.md + the two bonus
// findings (consent gate, safeLimit bypass).
//
// The deliverable is two written audit artifacts, not source code. This gate asserts
// the OBSERVABLE SHAPE of `findings/SUMMARY.md` (a coverage count, the clause-by-clause
// scoring rubric with the partial-credit rule, and both bonus findings — each naming
// its rule, location, consequence, and fix) and `findings/out-of-scope.md` (the
// duplicated ownership-transfer logic parked as a code-quality observation, NOT a
// scored finding) PLUS a source-shape probe that the two bonus defects are still
// present — the audit target is read-only, so a passing gate proves the student
// documented the defects rather than patching them.
//
// Self-contained: reads files off disk; imports nothing from the app (the target's
// 'use server' / server-only modules would not load in the node test env anyway).

// Resolve paths relative to this test file's location. Keep the base a URL — a bare
// path is not a valid `new URL()` base; a file: URL is, and it handles spaces in the
// "Chapter 082" path segment.
const readRepo = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const safeRead = (rel: string): string => {
  try {
    return readRepo(rel);
  } catch {
    return '';
  }
};

const SUMMARY = 'findings/SUMMARY.md';
const OUT_OF_SCOPE = 'findings/out-of-scope.md';
const PROVIDERS = 'src/app/_components/providers.tsx';
const TRIGGER_ROUTE = 'src/app/api/exports/trigger/route.ts';

// Strip HTML comments so a leftover skeleton TODO never counts as written content —
// the start skeletons name "deliberate misses", "reach", and "out-of-scope" only
// inside their TODO comments, so content matching must run against the stripped body.
const stripped = (md: string) => md.replace(/<!--[\s\S]*?-->/g, '').trim();

const summary = stripped(safeRead(SUMMARY));
const summaryLower = summary.toLowerCase();
const outOfScope = stripped(safeRead(OUT_OF_SCOPE));
const outOfScopeLower = outOfScope.toLowerCase();

// The slice of SUMMARY.md that documents one bonus finding, from the heading that
// names it through the next top-level `## ` header (or end of file). Empty string when
// no heading names the finding. Lets each bonus-finding assertion check that the rule,
// location, consequence, and fix all live in the SAME section, not scattered.
const bonusSection = (md: string, headingMatcher: RegExp): string => {
  const lines = md.split('\n');
  const start = lines.findIndex(
    (l) => l.startsWith('## ') && headingMatcher.test(l),
  );
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
};

describe('Lesson 10 — Commit and self-grade', () => {
  it('SUMMARY.md exists and carries written content (not just the skeleton TODO)', () => {
    expect(
      summary.length,
      `Could not read real content from ${SUMMARY}. Write the coverage scorecard there — the audit summary deliverable lives in findings/SUMMARY.md (the start skeleton holds only a heading and a TODO comment).`,
    ).toBeGreaterThan(40);
  });

  // Requirement 2: SUMMARY records a coverage count and names every deliberate miss
  // with one sentence of cause.
  describe('coverage count and deliberate misses (req 2)', () => {
    it('records a coverage count (e.g. 10/10 or 8/8)', () => {
      expect(
        summary,
        `${SUMMARY} must record a coverage count — how many of the categories were scored (e.g. "8/8" floor, "10/10" with both bonus findings). The coverage number is the headline of the scorecard.`,
      ).toMatch(/\b\d+\s*\/\s*\d+\b/);
    });

    it('accounts for deliberate misses (or states there were none)', () => {
      // A miss is the next audit's lesson, never a silent gap: SUMMARY names every
      // deliberate miss with a cause, OR states explicitly that none were skipped.
      expect(
        summaryLower,
        `${SUMMARY} must account for deliberate misses — name each skipped category with one sentence of cause, or state explicitly that none were skipped. A miss is documented, never silent.`,
      ).toMatch(
        /deliberate miss|misses?:?\s*none|no(ne)? (deliberate|skipped)|not (scored|skipped)/,
      );
    });
  });

  // Requirement 5: SUMMARY carries the clause-by-clause scoring rubric (rule, location,
  // consequence, fix) and the partial-credit rule.
  describe('clause-by-clause scoring rubric + partial-credit rule (req 5)', () => {
    it('names all four scoring clauses (rule, location, consequence, fix)', () => {
      for (const clause of ['rule', 'location', 'consequence', 'fix']) {
        expect(
          summaryLower,
          `The scoring rubric in ${SUMMARY} must name all four clauses each finding is scored on. Missing clause: "${clause}". The rubric scores rule, location, consequence, and fix.`,
        ).toContain(clause);
      }
    });

    it('states the partial-credit rule (rule + location is the floor, fix detail is the reach)', () => {
      expect(
        summaryLower,
        `The rubric in ${SUMMARY} must state the partial-credit rule: rule + location is the audit floor; the fix detail is the reach. That is the constraint this lesson teaches — name the floor explicitly.`,
      ).toMatch(/partial[\s-]?credit|floor|reach/);
    });
  });

  // Requirement 3: SUMMARY documents bonus finding 9 (consent gate) with its rule,
  // location, consequence, and fix.
  describe('bonus finding 9 — consent gate (req 3)', () => {
    const section = bonusSection(summary, /consent/i);
    const lower = section.toLowerCase();

    it('has a section that names the consent gate as bonus finding 9', () => {
      expect(
        section.length,
        `${SUMMARY} must document bonus finding 9 — the missing PostHog consent gate — in its own section (a "## " heading naming the consent gate). This is one of the two findings that lift the score from 8/8 to 10/10.`,
      ).toBeGreaterThan(0);
    });

    it('names the location (providers.tsx / opt_out_capturing_by_default)', () => {
      expect(
        lower,
        `Bonus finding 9 in ${SUMMARY} must name its location: src/app/_components/providers.tsx, the opt_out_capturing_by_default: false default. Name the file and the config key, not a vague "analytics setup".`,
      ).toMatch(/providers\.tsx|opt_out_capturing_by_default/);
    });

    it('names the consequence (a pre-consent capture / tracking without consent)', () => {
      expect(
        lower,
        `Bonus finding 9 in ${SUMMARY} must state the consequence in human/legal terms: a network capture fires before the user consents — tracking without consent. State the failure for a person, not a hedge.`,
      ).toMatch(/consent|gdpr|eprivacy|first (page )?load|before the user/);
    });

    it('names the fix (opt_out default true and/or a consent-gated init)', () => {
      expect(
        lower,
        `Bonus finding 9 in ${SUMMARY} must name the fix: set opt_out_capturing_by_default: true AND gate the init behind recorded consent (a ConsentProvider). Naming only the default flip is the partial — the reach is both belts.`,
      ).toMatch(/true|consent[\s-]?(provider|gate|gated|recorded)/);
    });
  });

  // Requirement 4: SUMMARY documents bonus finding 10 (safeLimit bypass) with its rule,
  // location, consequence, and fix.
  describe('bonus finding 10 — safeLimit bypass (req 4)', () => {
    const section = bonusSection(
      summary,
      /safelimit|\.limit\(|rate[\s-]?limit/i,
    );
    const lower = section.toLowerCase();

    it('has a section that names the safeLimit bypass as bonus finding 10', () => {
      expect(
        section.length,
        `${SUMMARY} must document bonus finding 10 — the safeLimit bypass — in its own section (a "## " heading naming safeLimit / the bare .limit() bypass). This is the second of the two findings that lift the score to 10/10.`,
      ).toBeGreaterThan(0);
    });

    it('names the rule and the seam (safeLimit)', () => {
      expect(
        lower,
        `Bonus finding 10 in ${SUMMARY} must name the seam by its helper: safeLimit. The fix is the seam, not a try/catch around the bare call — name the single place the fail-open policy lives.`,
      ).toContain('safelimit');
    });

    it('names the location (the export-trigger route / a bare .limit() call)', () => {
      expect(
        lower,
        `Bonus finding 10 in ${SUMMARY} must name its location: src/app/api/exports/trigger/route.ts, the bare signInLimiter.limit() call that does not route through safeLimit. Name the file and the bypassed call.`,
      ).toMatch(/trigger\/route\.ts|exports\/trigger|\.limit\(/);
    });

    it('names the consequence (Redis outage 500s the endpoint / fail-open broken)', () => {
      expect(
        lower,
        `Bonus finding 10 in ${SUMMARY} must state the consequence: on a Redis outage the bare .limit() throws and 500s the endpoint (fail-closed by accident) and skips the operator log. State what breaks for a human/operator.`,
      ).toMatch(/redis|outage|500|fail[\s-]?open|operator/);
    });
  });

  // Requirement 7: out-of-scope.md records the duplicated ownership-transfer logic as a
  // parked observation, not a scored finding.
  describe('out-of-scope.md parks the duplicated transfer logic (req 7)', () => {
    it('exists and carries written content (not just the skeleton TODO)', () => {
      expect(
        outOfScope.length,
        `Could not read real content from ${OUT_OF_SCOPE}. Record the parked observation there (the start skeleton holds only a heading and a TODO comment).`,
      ).toBeGreaterThan(40);
    });

    it('names the duplicated ownership-transfer logic as the observation', () => {
      expect(
        outOfScopeLower,
        `${OUT_OF_SCOPE} must name the duplicated ownership-transfer logic in transfer-ownership.ts — the two near-identical transfer bodies. That is the off-category observation this file parks.`,
      ).toMatch(/duplicat/);
    });

    it('frames it as an observation, not a scored finding (count stays honest)', () => {
      // The discipline this teaches: an off-category observation is a ticket-in-waiting,
      // never a finding. The file must say so, so the coverage number is not inflated.
      expect(
        outOfScopeLower,
        `${OUT_OF_SCOPE} must frame the duplication as NOT a scored finding (a code-quality observation, not one of the eight scored categories). Keeping it out of the finding count is the point — one defect, one finding.`,
      ).toMatch(
        /not a (scored )?finding|code[\s-]?quality|not (one of )?(the )?(eight|scored)|not scored/,
      );
    });
  });

  // Requirement 9 (source-shape probe): the audit target still boots and runs unchanged
  // — neither bonus defect was patched. The target is read-only; a passing probe proves
  // the student documented the defects rather than fixing them.
  describe('the audit target still ships both bonus defects (req 9)', () => {
    const providers = safeRead(PROVIDERS);
    const triggerRoute = safeRead(TRIGGER_ROUTE);

    it('providers.tsx still defaults consent capturing ON (defect 9 intact)', () => {
      expect(
        providers,
        `Could not read ${PROVIDERS}. The audit target is read-only — do not move or delete it.`,
      ).not.toBe('');
      const flat = providers.replace(/\s+/g, ' ');
      expect(
        /opt_out_capturing_by_default\s*:\s*false/.test(flat),
        `The seeded consent-gate defect is gone from ${PROVIDERS} (opt_out_capturing_by_default is no longer false). The target is read-only — document bonus finding 9, do not patch it.`,
      ).toBe(true);
    });

    it('the export-trigger route still calls a bare .limit() (defect 10 intact)', () => {
      expect(
        triggerRoute,
        `Could not read ${TRIGGER_ROUTE}. The audit target is read-only — do not move or delete it.`,
      ).not.toBe('');
      const flat = triggerRoute.replace(/\s+/g, ' ');
      // The bypass: a bare limiter.limit(...) that does NOT route through safeLimit.
      const bareLimit = /signInLimiter\.limit\(/.test(flat);
      const routedThroughSeam = /safeLimit\s*\(/.test(flat);
      expect(
        bareLimit && !routedThroughSeam,
        `The seeded safeLimit-bypass defect is gone from ${TRIGGER_ROUTE} (the bare signInLimiter.limit() call now routes through safeLimit). The target is read-only — document bonus finding 10, do not patch it.`,
      ).toBe(true);
    });
  });
});
