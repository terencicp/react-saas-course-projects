import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 8 — Finding 007 — the dep-hygiene gap (pnpm-workspace.yaml).
//
// The deliverable is a written audit finding, not source code. This gate asserts
// the OBSERVABLE SHAPE of `findings/007-dep-hygiene.md` (the four template sections
// are populated, the rule is named as the pnpm 11+ supply-chain defaults, and the
// Location records the three disabled flags + the right host file + the discovery
// commands) PLUS a source-shape probe that the seeded defect is still present in
// pnpm-workspace.yaml — the audit target is read-only, so a passing gate proves the
// student documented the defect rather than patching it.
//
// Self-contained: reads files off disk; imports nothing from the app.

// Resolve paths relative to this test file's location (tests/lessons/ -> repo root).
// Keep the base a URL — a bare path is not a valid `new URL()` base; a file: URL is,
// and it handles the space in the "Chapter 082" path segment.
const readRepo = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const FINDING = 'findings/007-dep-hygiene.md';
const WORKSPACE = 'pnpm-workspace.yaml';

const finding = (() => {
  try {
    return readRepo(FINDING);
  } catch {
    return '';
  }
})();

// Body text under a `## Header`, up to the next `## ` header or end of file.
// Empty string when the header is missing or carries no content. Strips HTML
// comments (the skeleton's TODO lives in one) so a leftover TODO never counts as
// "populated".
const sectionBody = (md: string, header: string): string => {
  const withoutComments = md.replace(/<!--[\s\S]*?-->/g, '');
  const lines = withoutComments.split('\n');
  const start = lines.findIndex(
    (l) => l.trim().toLowerCase() === `## ${header}`.toLowerCase(),
  );
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l.trim()));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  return body.trim();
};

describe('Req 1 — all four template sections are populated and the rule names the pnpm 11+ supply-chain defaults', () => {
  it('reads the finding file at findings/007-dep-hygiene.md', () => {
    expect(
      finding,
      `Could not read ${FINDING}. Write the finding there — the audit deliverable lives in findings/007-dep-hygiene.md.`,
    ).not.toBe('');
  });

  for (const header of ['Rule', 'Location', 'Consequence', 'Fix']) {
    it(`## ${header} carries real content`, () => {
      const body = sectionBody(finding, header);
      expect(
        body.length,
        `The "## ${header}" section in ${FINDING} is empty (or only the TODO comment remains). Fill all four sections (Rule, Location, Consequence, Fix) following findings/template.md.`,
      ).toBeGreaterThan(20);
    });
  }

  it('the Rule section names the pnpm supply-chain defaults', () => {
    const rule = sectionBody(finding, 'Rule').toLowerCase();
    // The rule is the pnpm 11+ supply-chain defaults — named via the flags the
    // defaults govern (minimumReleaseAge is the load-bearing one) and/or
    // "supply-chain".
    const namesPnpmDefense =
      /pnpm/.test(rule) &&
      /minimumreleaseage|supply[\s-]?chain|blockexoticsubdeps|strictdepbuilds/.test(
        rule,
      );
    expect(
      namesPnpmDefense,
      'The "## Rule" section does not name the rule as pnpm 11+ supply-chain defaults. State which rule the target violates — the pnpm supply-chain defaults (minimumReleaseAge / blockExoticSubdeps / strictDepBuilds).',
    ).toBe(true);
  });

  it('the Rule section cites the rule source (chapter 081 lesson 8)', () => {
    const rule = sectionBody(finding, 'Rule').toLowerCase();
    const citesRule = /081.*lesson\s*8|081.*l\s*8|chapter\s*081/.test(rule);
    expect(
      citesRule,
      'The "## Rule" section does not cite the rule source. Reference chapter 081 lesson 8 (the pnpm 11+ supply-chain defaults) as the rule this violates.',
    ).toBe(true);
  });
});

describe('Req 2 — the Location records the disabled flags, the right host file, and the discovery commands', () => {
  it('names all three disabled flags', () => {
    const location = sectionBody(finding, 'Location').toLowerCase();
    const missing = [
      'minimumreleaseage',
      'blockexoticsubdeps',
      'strictdepbuilds',
    ].filter((flag) => !location.includes(flag));
    expect(
      missing,
      `The "## Location" section does not record all three disabled flags. Name each one — minimumReleaseAge, blockExoticSubdeps, strictDepBuilds — as the load-bearing gap. Missing: ${missing.join(', ') || 'none'}.`,
    ).toEqual([]);
  });

  it('names pnpm-workspace.yaml as where the settings live (not .npmrc)', () => {
    const location = sectionBody(finding, 'Location').toLowerCase();
    expect(
      location.includes('pnpm-workspace.yaml'),
      'The "## Location" section does not name pnpm-workspace.yaml. pnpm 11 reads these settings from the workspace file, never from .npmrc — name where the controls actually live.',
    ).toBe(true);
  });

  it('records the discovery command and the pnpm audit corroboration', () => {
    const location = sectionBody(finding, 'Location').toLowerCase();
    // The discovery is a read (an rg/grep on the workspace file) and the
    // corroborating post-install signal is `pnpm audit`.
    const namesDiscovery = /\b(rg|grep)\b/.test(location);
    const namesAudit = /pnpm\s+audit/.test(location);
    expect(
      namesDiscovery,
      'The "## Location" section does not name the discovery command. A finding records how it was found — name the rg/grep on pnpm-workspace.yaml (the deterministic, no-install read).',
    ).toBe(true);
    expect(
      namesAudit,
      'The "## Location" section does not name the `pnpm audit --prod` corroboration. Record it as the post-install signal that backs the read — not as the defense.',
    ).toBe(true);
  });
});

describe('Req 7 — the seeded defect is still present (target documented, not patched)', () => {
  const workspace = (() => {
    try {
      return readRepo(WORKSPACE);
    } catch {
      return '';
    }
  })();

  it('pnpm-workspace.yaml is present', () => {
    expect(
      workspace,
      `Could not read ${WORKSPACE}. The audit target is read-only — do not move or delete it.`,
    ).not.toBe('');
  });

  // Match `flag: <value>` at the start of a line (top-level key), tolerating
  // whitespace and surrounding formatting differences.
  const flagValue = (yaml: string, flag: string): string | null => {
    const match = yaml.match(new RegExp(`^\\s*${flag}\\s*:\\s*(\\S+)`, 'm'));
    return match?.[1] ?? null;
  };

  it('minimumReleaseAge is still 0 (no pre-install window)', () => {
    expect(
      flagValue(workspace, 'minimumReleaseAge'),
      'minimumReleaseAge is no longer 0 in pnpm-workspace.yaml — the audit target must stay unpatched. Document the disabled state in the finding; do not restore the flag here.',
    ).toBe('0');
  });

  it('blockExoticSubdeps is still false', () => {
    expect(
      flagValue(workspace, 'blockExoticSubdeps'),
      'blockExoticSubdeps is no longer false in pnpm-workspace.yaml — the audit target must stay unpatched. The deliverable is the documented finding, not a fix to the workspace file.',
    ).toBe('false');
  });

  it('strictDepBuilds is still false', () => {
    expect(
      flagValue(workspace, 'strictDepBuilds'),
      'strictDepBuilds is no longer false in pnpm-workspace.yaml — the audit target must stay unpatched. Document the defect in the finding; do not restore the flag here.',
    ).toBe('false');
  });
});
