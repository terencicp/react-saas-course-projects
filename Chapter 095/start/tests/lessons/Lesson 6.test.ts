import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 6 — Findings 005/006/008: the performance half of the audit + the one
// in-place barrel fix.
//
// The deliverable is written audit findings, not source code, plus a single config
// edit. This gate is a set of `readFileSync` source-shape probes (node env, no DOM):
// it asserts the OBSERVABLE SHAPE of the three finding files (four template sections
// populated, the chapter 094 rule cited, the right defect location, the named fix)
// and the one in-place fix (next.config.ts lists `lucide-react` under
// `experimental.optimizePackageImports`). It also enforces the load-bearing
// "document, don't patch" constraint: the waterfall and the N+1 must STAY in source
// (only the barrel is fixed), so the gate reads the audit target itself.
//
// Self-contained: reads files off disk; imports nothing from the app.

// Resolve paths relative to this test file's location (tests/lessons/ -> repo root).
// Keep the base a URL — a bare path is not a valid `new URL()` base; a file: URL is,
// and it handles the space in the "Chapter 095" path segment.
const readRepo = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

const readOrEmpty = (rel: string) => {
  try {
    return readRepo(rel);
  } catch {
    return '';
  }
};

// Body text under a `## Header`, up to the next `## ` header or end of file. Empty
// string when the header is missing or carries no content. Strips HTML comments (the
// skeleton's TODO lives in one) so a leftover TODO never counts as "populated".
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

// Shared check: all four template sections (Rule, Location, Consequence, Fix) carry
// real content, not just the skeleton's empty headers or a leftover TODO comment.
const assertFourSections = (finding: string, path: string) => {
  for (const header of ['Rule', 'Location', 'Consequence', 'Fix']) {
    it(`## ${header} carries real content`, () => {
      const body = sectionBody(finding, header);
      expect(
        body.length,
        `The "## ${header}" section in ${path} is empty (or only the TODO comment remains). Fill all four sections (Rule, Location, Consequence, Fix) following findings/template.md.`,
      ).toBeGreaterThan(20);
    });
  }
};

// ---------------------------------------------------------------------------
// Req 1 — findings/005-rsc-waterfall.md
// ---------------------------------------------------------------------------
describe('Req 1 — finding 005 documents the dashboard RSC waterfall', () => {
  const PATH = 'findings/005-rsc-waterfall.md';
  const finding = readOrEmpty(PATH);

  it('reads the finding file at findings/005-rsc-waterfall.md', () => {
    expect(
      finding,
      `Could not read ${PATH}. The audit deliverable lives there — write the RSC-waterfall finding in findings/005-rsc-waterfall.md.`,
    ).not.toBe('');
  });

  assertFourSections(finding, PATH);

  it('cites the chapter 094 lesson 6 RSC-waterfall rule', () => {
    const rule = sectionBody(finding, 'Rule').toLowerCase();
    const cites = /094.*lesson\s*6|094.*l\s*6|chapter\s*094/.test(rule);
    expect(
      cites,
      'The "## Rule" section does not cite the rule source. Reference chapter 094 lesson 6 (RSC waterfalls and the dependency-check reflex) as the rule this violates.',
    ).toBe(true);
  });

  it('locates the defect in dashboard/page.tsx', () => {
    const location = sectionBody(finding, 'Location').toLowerCase();
    expect(
      location.includes('dashboard/page.tsx'),
      'The "## Location" section does not name src/app/(protected)/dashboard/page.tsx — point at the file where the four awaits run back to back.',
    ).toBe(true);
  });

  it('names the fix as parallelizing the independent pair only (Promise.all)', () => {
    const fix = sectionBody(finding, 'Fix').toLowerCase();
    const namesPromiseAll = /promise\.all/.test(fix);
    // The teaching point: only the independent invoices+members pair parallelizes,
    // user -> org stays sequential. The fix must scope to the independent pair, not
    // "wrap everything".
    const scopesToIndependent =
      /independent|invoices.*members|members.*invoices|the pair|only/.test(fix);
    expect(
      namesPromiseAll,
      'The "## Fix" section does not name Promise.all. The fix for the waterfall is parallelizing the two independent reads with Promise.all.',
    ).toBe(true);
    expect(
      scopesToIndependent,
      'The "## Fix" section does not scope the Promise.all to the independent pair. Parallelize only invoices+members; user -> org stays sequential (wrapping all four is the "wrap everything" anti-pattern).',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Req 2 — findings/006-barrel-import.md
// ---------------------------------------------------------------------------
describe('Req 2 — finding 006 documents the lucide-react barrel import', () => {
  const PATH = 'findings/006-barrel-import.md';
  const finding = readOrEmpty(PATH);

  it('reads the finding file at findings/006-barrel-import.md', () => {
    expect(
      finding,
      `Could not read ${PATH}. The audit deliverable lives there — write the barrel-import finding in findings/006-barrel-import.md.`,
    ).not.toBe('');
  });

  assertFourSections(finding, PATH);

  it('cites the chapter 094 lessons 3/4 barrel + analyzer rule', () => {
    const rule = sectionBody(finding, 'Rule').toLowerCase();
    const cites =
      /094.*lessons?\s*3|094.*l\s*3|094.*lessons?\s*4|chapter\s*094/.test(rule);
    expect(
      cites,
      'The "## Rule" section does not cite the rule source. Reference chapter 094 lessons 3/4 (the barrel-export trap + the Turbopack analyzer).',
    ).toBe(true);
  });

  it('locates it in (protected)/layout.tsx and next.config.ts', () => {
    const location = sectionBody(finding, 'Location').toLowerCase();
    expect(
      location.includes('layout.tsx'),
      'The "## Location" section does not name the (protected) layout.tsx where the dozen lucide-react icons are imported from the barrel.',
    ).toBe(true);
    expect(
      location.includes('next.config.ts'),
      'The "## Location" section does not name next.config.ts — record the missing optimizePackageImports entry as the second half of the location.',
    ).toBe(true);
  });

  it('names the optimizePackageImports fix', () => {
    const fix = sectionBody(finding, 'Fix').toLowerCase();
    expect(
      fix.includes('optimizepackageimports'),
      'The "## Fix" section does not name optimizePackageImports. The senior fix is the single config seam, not hand-converting each import to a per-icon path.',
    ).toBe(true);
  });

  it('embeds both before-barrel.png and after-barrel.png screenshots', () => {
    const all = finding.toLowerCase();
    expect(
      all.includes('before-barrel.png'),
      'Finding 006 does not embed screenshots/before-barrel.png. The before/after analyzer treemap is the required evidence — embed it with a markdown image reference.',
    ).toBe(true);
    expect(
      all.includes('after-barrel.png'),
      'Finding 006 does not embed screenshots/after-barrel.png. Embed the after-fix treemap (the collapsed lucide-react tile) alongside the before shot.',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Req 3 — findings/008-n-plus-1-invoices.md
// ---------------------------------------------------------------------------
describe('Req 3 — finding 008 documents the N+1 in the invoice helper', () => {
  const PATH = 'findings/008-n-plus-1-invoices.md';
  const finding = readOrEmpty(PATH);

  it('reads the finding file at findings/008-n-plus-1-invoices.md', () => {
    expect(
      finding,
      `Could not read ${PATH}. The audit deliverable lives there — write the N+1 finding in findings/008-n-plus-1-invoices.md.`,
    ).not.toBe('');
  });

  assertFourSections(finding, PATH);

  it('cites the chapter 094 lesson 7 N+1 rule', () => {
    const rule = sectionBody(finding, 'Rule').toLowerCase();
    const cites = /094.*lesson\s*7|094.*l\s*7|chapter\s*094/.test(rule);
    expect(
      cites,
      'The "## Rule" section does not cite the rule source. Reference chapter 094 lesson 7 (N+1 queries and the Drizzle relations API).',
    ).toBe(true);
  });

  it('locates it in invoices-with-customer.ts', () => {
    const location = sectionBody(finding, 'Location').toLowerCase();
    expect(
      location.includes('invoices-with-customer.ts'),
      'The "## Location" section does not name src/db/queries/invoices-with-customer.ts — point at the dedicated helper whose loop fires one customer query per invoice.',
    ).toBe(true);
  });

  it('names the relations-API fix verified with .toSQL()', () => {
    const fix = sectionBody(finding, 'Fix').toLowerCase();
    // The fix is the Drizzle relations API: findMany({ with: { customer: true } }).
    const namesRelationsApi =
      /findmany/.test(fix) && /with:\s*\{\s*customer/.test(fix);
    const namesToSql = /\.tosql\(\)/.test(fix);
    expect(
      namesRelationsApi,
      'The "## Fix" section does not name the relations-API rewrite. The fix is db.query.invoices.findMany({ with: { customer: true } }), which emits one lateral-join statement.',
    ).toBe(true);
    expect(
      namesToSql,
      'The "## Fix" section does not name the .toSQL() verification. Confirm the relations API produced ONE join (not N selects) with .toSQL().',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Req 4 — the one in-place fix: next.config.ts lists lucide-react under
// experimental.optimizePackageImports
// ---------------------------------------------------------------------------
describe('Req 4 — next.config.ts applies the barrel fix under experimental', () => {
  const PATH = 'next.config.ts';
  const config = readOrEmpty(PATH);

  it('reads next.config.ts', () => {
    expect(
      config,
      `Could not read ${PATH}. The one in-place performance fix lives in next.config.ts.`,
    ).not.toBe('');
  });

  it('lists lucide-react under optimizePackageImports', () => {
    // Single statement spanning a few lines: optimizePackageImports: [ ... 'lucide-react' ... ].
    const matches = config.match(
      /optimizePackageImports\s*:\s*\[[^\]]*['"]lucide-react['"][^\]]*\]/,
    );
    expect(
      matches,
      "next.config.ts does not list 'lucide-react' under optimizePackageImports. Add it to the optimizePackageImports array so the build rewrites the barrel import — this is the one in-place performance fix.",
    ).not.toBeNull();
  });

  it('places optimizePackageImports under the experimental key (Next.js 16.2)', () => {
    // As of Next.js 16.2 the option is still namespaced under `experimental`, not a
    // top-level config key. Assert the key sits inside an `experimental: { ... }` block.
    const experimentalBlock = config.match(
      /experimental\s*:\s*\{[\s\S]*?optimizePackageImports/,
    );
    expect(
      experimentalBlock,
      "optimizePackageImports is not under `experimental`. In Next.js 16.2 it is still namespaced — write `experimental: { optimizePackageImports: ['lucide-react'] }`, not a top-level key.",
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Document, don't patch — the load-bearing constraint of this lesson. The waterfall
// and the N+1 are DOCUMENTED, not fixed; only the barrel is patched in place. These
// probes read the audit target itself to prove the student didn't "just fix it while
// in the file".
// ---------------------------------------------------------------------------
describe('Constraint — the waterfall and N+1 stay in source (document, do not patch)', () => {
  it('dashboard/page.tsx still awaits invoices and members sequentially (no Promise.all)', () => {
    const page = readOrEmpty('src/app/(protected)/dashboard/page.tsx');
    expect(
      page,
      'Could not read src/app/(protected)/dashboard/page.tsx — the audit target must stay in place.',
    ).not.toBe('');
    expect(
      /Promise\.all/.test(page),
      'dashboard/page.tsx now wraps reads in Promise.all — the waterfall was PATCHED. This lesson documents it (in finding 005), it does not fix it. The staircase must stay readable in source; the fix goes to the backlog (lesson 7).',
    ).toBe(false);
  });

  it('invoices-with-customer.ts still loops per invoice (no findMany relations rewrite)', () => {
    const helper = readOrEmpty('src/db/queries/invoices-with-customer.ts');
    expect(
      helper,
      'Could not read src/db/queries/invoices-with-customer.ts — the audit target must stay in place.',
    ).not.toBe('');
    const stillLoops = /for\s*\(/.test(helper);
    const usesRelationsApi =
      /findMany\s*\(\s*\{[\s\S]*with:\s*\{\s*customer/.test(helper);
    expect(
      stillLoops && !usesRelationsApi,
      'invoices-with-customer.ts no longer N+1s — the loop was replaced with the relations API. This lesson documents the N+1 (in finding 008), it does not fix it. The fingerprint must stay in source; the fix goes to the backlog (lesson 7).',
    ).toBe(true);
  });
});
