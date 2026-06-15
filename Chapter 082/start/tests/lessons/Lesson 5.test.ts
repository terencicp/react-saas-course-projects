import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 5 — Finding 004 — the CSP header omission.
//
// This gate asserts only observable artifacts: the SHAPE of the finding the
// student writes (findings/004-csp-header.md) and the SOURCE of the audit target
// (next.config.ts, src/proxy.ts). It never asserts file paths the student must
// create or imports — only the content they produce and the defect they leave in
// place. The target is read-only, so the gate proves the student DOCUMENTED the
// defect rather than patching it.

// Resolve repo files from this test's own location (tests/lessons/ -> repo root),
// so the gate runs the same regardless of the cwd the runner is invoked from.
const REPO_ROOT = new URL('../../', import.meta.url);
const readRepoFile = (rel: string) =>
  readFileSync(new URL(rel, REPO_ROOT), 'utf8');

const FINDING = 'findings/004-csp-header.md';

// Split a finding into its `## Header` sections, dropping HTML comments (the TODO
// scaffold) so an unpopulated section reads as empty rather than "has a comment".
const sectionBody = (markdown: string, header: string): string => {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const lines = withoutComments.split('\n');
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${header}`.toLowerCase(),
  );
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line.trim()));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  return body.trim();
};

const finding = (() => {
  try {
    return readRepoFile(FINDING);
  } catch {
    return null;
  }
})();

describe('Req 1 — all four template sections are populated', () => {
  it('reads the finding file at findings/004-csp-header.md', () => {
    expect(
      finding,
      'findings/004-csp-header.md is missing or unreadable — write the finding there.',
    ).not.toBeNull();
  });

  for (const header of ['Rule', 'Location', 'Consequence', 'Fix']) {
    it(`has a non-empty "## ${header}" section`, () => {
      const body = sectionBody(finding ?? '', header);
      expect(
        body.length,
        `The "## ${header}" section is empty. Fill all four sections (Rule, Location, Consequence, Fix) — an empty section means the finding is unfinished.`,
      ).toBeGreaterThan(0);
    });
  }
});

describe('Req 2 — the Rule names the CSP / security-headers rule', () => {
  it('names Content-Security-Policy (or CSP) in the Rule section', () => {
    const rule = sectionBody(finding ?? '', 'Rule');
    const namesCsp = /content-security-policy|\bcsp\b/i.test(rule);
    expect(
      namesCsp,
      'The Rule section does not name the Content-Security-Policy / CSP rule. State which security-headers rule (chapter 081 lesson 1) the target violates.',
    ).toBe(true);
  });

  it('cites the security-headers rule source (chapter 081)', () => {
    const rule = sectionBody(finding ?? '', 'Rule');
    const citesRule = /\b081\b/.test(rule) || /lesson\s*1/i.test(rule);
    expect(
      citesRule,
      'The Rule section does not cite the rule source. Reference chapter 081 lesson 1 (the six security headers) as the rule this violates.',
    ).toBe(true);
  });
});

describe('Req 3 — the Location records curl evidence and names a host file', () => {
  it('records the curl -I header read', () => {
    const location = sectionBody(finding ?? '', 'Location');
    expect(
      /curl\s+-[a-z]*i/i.test(location),
      'The Location section does not record the `curl -I` evidence. Show the running-app header read (e.g. `curl -I http://localhost:3000/`) that proves the CSP header is absent.',
    ).toBe(true);
  });

  it('names a file where the CSP should live', () => {
    const location = sectionBody(finding ?? '', 'Location');
    const namesHostFile =
      /next\.config\.ts/i.test(location) || /proxy\.ts/i.test(location);
    expect(
      namesHostFile,
      'The Location section does not name a file the CSP should live in. For this missing-piece finding, name next.config.ts and/or src/proxy.ts as the home the policy lacks.',
    ).toBe(true);
  });
});

describe('Req 4 — the Fix names the senior reach, not just "add a CSP"', () => {
  it('names the per-request nonce', () => {
    const fix = sectionBody(finding ?? '', 'Fix');
    expect(
      /nonce/i.test(fix),
      'The Fix section does not mention the per-request nonce. "Add a CSP header" is the beginner answer; the load-bearing part is a fresh nonce minted per request.',
    ).toBe(true);
  });

  it("names 'strict-dynamic'", () => {
    const fix = sectionBody(finding ?? '', 'Fix');
    expect(
      /strict-dynamic/i.test(fix),
      "The Fix section does not mention 'strict-dynamic'. Name it as the directive that lets nonce-trusted scripts load their own chunks without an allow-list of hosts.",
    ).toBe(true);
  });
});

describe('Req 5 — the seeded defect is still present (target documented, not patched)', () => {
  it('next.config.ts ships no Content-Security-Policy key', () => {
    const config = readRepoFile('next.config.ts');
    expect(
      /content-security-policy/i.test(config),
      'next.config.ts now references a Content-Security-Policy — the audit target must stay unpatched. Document the defect in the finding; do not add a CSP to the config.',
    ).toBe(false);
  });

  it('src/proxy.ts mints no per-request nonce', () => {
    const proxy = readRepoFile('src/proxy.ts');
    const minted =
      /nonce/i.test(proxy) || /content-security-policy/i.test(proxy);
    expect(
      minted,
      'src/proxy.ts now mints a nonce or sets a CSP — the audit target must stay unpatched. The deliverable is the documented finding, not a fix to proxy.ts.',
    ).toBe(false);
  });
});
