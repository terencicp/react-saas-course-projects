import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 7 — Finding 006 — the missing rate limit on password-reset
// (src/app/api/auth/reset-password/route.ts).
//
// This gate is self-contained: it imports only vitest + node:fs and reads the
// committed artifacts by path. It asserts the observable shape of the deliverable
// (findings/006-rate-limit-password-reset.md) and a source-shape probe proving the
// audit stayed read-only (the seeded defect is still present in the target).
//
// The project root is two directories up from this tests/lessons/ folder.
// Keep the base a URL (never fileURLToPath it): a file: URL is a valid new URL()
// base and tolerates spaces in the path; a bare path would throw "Invalid URL".
const fromRoot = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

// The finding the student writes this lesson.
const finding = (): string => {
  try {
    return fromRoot('findings/006-rate-limit-password-reset.md');
  } catch {
    throw new Error(
      'Could not read findings/006-rate-limit-password-reset.md — write the finding into this file before running the test.',
    );
  }
};

// Split a finding's markdown into { header -> body } keyed by the `## Header` lines,
// so "populated" means there is real prose under a section, not just the heading.
// Treat a deeper `### Sub-header` (e.g. the coverage matrix) as part of its parent
// section's body so the four top-level sections stay the only keys.
const sections = (md: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const parts = md.split(/^##\s+(?!#)/m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf('\n');
    const name = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? '' : part.slice(newline + 1);
    // Strip TODO comments so a leftover skeleton hint never reads as content.
    out[name] = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  return out;
};

describe('Lesson 7 — Finding 006 — the four template sections are populated', () => {
  it('Rule, Location, Consequence, and Fix each carry real prose', () => {
    const s = sections(finding());
    for (const name of ['Rule', 'Location', 'Consequence', 'Fix']) {
      expect(
        s[name],
        `The finding is missing a "## ${name}" section header — it must keep all four template sections (Rule, Location, Consequence, Fix).`,
      ).toBeTypeOf('string');
      expect(
        (s[name] ?? '').length,
        `The "## ${name}" section is empty or still the skeleton — write the ${name} content into findings/006-rate-limit-password-reset.md.`,
      ).toBeGreaterThan(40);
    }
  });
});

describe('Lesson 7 — Finding 006 — the rate-limit-coverage rule is named', () => {
  it('cites coverage of every abusable endpoint, its three triggers, and chapter 081 lesson 2', () => {
    const md = finding();
    const rule = sections(md).Rule ?? '';

    // The rule is "rate-limit coverage": abusable endpoints must route through a limiter.
    expect(
      /rate[\s-]*limit/i.test(rule),
      'The Rule section never names the rate-limit rule — state that every abusable endpoint must route through a named limiter.',
    ).toBe(true);
    // The rule's threshold: any one of three mandatory triggers.
    expect(
      /three|3\b/.test(rule),
      'The Rule section never names that the rule has three triggers — name the three triggers that make a limiter mandatory.',
    ).toBe(true);
    // The two load-bearing triggers this endpoint hits: money per call + third party.
    expect(
      /money|cost|paid|bill/i.test(rule),
      'The Rule section never names the money-per-call trigger — this endpoint fires a paid Resend send on every request.',
    ).toBe(true);
    expect(
      /third[\s-]*party|inbox|victim/i.test(rule),
      "The Rule section never names the third-party trigger — the supplied email is a victim's inbox.",
    ).toBe(true);
    // Linked by section to the source lesson.
    expect(
      /081[\s\S]*lesson\s*2|lesson\s*2[\s\S]*081/i.test(md),
      'The finding never cites chapter 081 lesson 2 (the rate-limit-coverage rule and matrix) — cite it by section.',
    ).toBe(true);
  });
});

describe('Lesson 7 — Finding 006 — the location is the gap between two files', () => {
  it('names the discovery command and both files, and that resetLimiter is declared but unwired', () => {
    const location = sections(finding()).Location ?? '';

    // A discovery command: the coverage greps run rg/grep over the limiter / send.
    expect(
      /\b(rg|grep)\b/.test(location),
      'The Location section names no discovery command — show the grep (e.g. `rg -rn resetLimiter src/app`) that proved the limiter is unwired.',
    ).toBe(true);
    // The declared-limiter file.
    expect(
      /rate-limit\.ts/.test(location),
      'The Location section never names src/lib/rate-limit.ts where resetLimiter is declared.',
    ).toBe(true);
    // The unthrottled route file.
    expect(
      /reset-password\/route\.ts|reset-password\b/.test(location),
      'The Location section never names src/app/api/auth/reset-password/route.ts — the route that sends with no limiter.',
    ).toBe(true);
    // The gap itself: the limiter exists but the route never reaches it.
    expect(
      /resetLimiter/.test(location),
      'The Location section never names resetLimiter — the gap is that this declared limiter is never imported by the route.',
    ).toBe(true);
  });
});

describe('Lesson 7 — Finding 006 — the fix names the senior reach', () => {
  it('names the dual-keyed (per-IP + per-email) safeLimit fix returning a generic 429', () => {
    const fix = sections(finding()).Fix ?? '';

    // Dual keying: per-IP AND per-email, not per-IP alone.
    expect(
      /per[\s-]*email|email/i.test(fix),
      'The Fix section never names a per-email key — per-IP alone misses the inbox-bomb/enumeration vectors; the fix must key on the email too.',
    ).toBe(true);
    expect(
      /per[\s-]*ip|\bip\b/i.test(fix),
      'The Fix section never names the per-IP key — name both gates (per-IP and per-email) of the dual-keyed fix.',
    ).toBe(true);
    // The fail-open wrapper the lineage already ships.
    expect(
      /safeLimit/.test(fix),
      'The Fix section never names safeLimit — the fail-open wrapper both gates run through so a Redis outage keeps the reset path up.',
    ).toBe(true);
    // The rejection: a generic 429.
    expect(
      /429/.test(fix),
      'The Fix section never names the 429 rejection — on reject the route must return a generic 429.',
    ).toBe(true);
  });
});

describe('Lesson 7 — Finding 006 — a coverage matrix is attached', () => {
  it('includes a markdown table covering endpoint, file, limiter, key, and covered Y/N', () => {
    const md = finding();

    // A markdown table: a header row plus the `---` separator row of a GFM table.
    const hasTable = /\|.*\|[\s\S]*?\n\s*\|[\s-:|]+\|/.test(md);
    expect(
      hasTable,
      'The finding has no markdown table — attach the coverage matrix (endpoint category, file, limiter, key strategy, covered Y/N) as a table.',
    ).toBe(true);
    // The matrix columns the lesson asks for.
    expect(
      /limiter/i.test(md) && /key/i.test(md) && /cover/i.test(md),
      'The coverage matrix is missing its columns — it must track the limiter, the key strategy, and whether each endpoint is covered.',
    ).toBe(true);
    // More than just this one endpoint: other abusable endpoints are rows too
    // (sign-in/sign-up recorded as open tickets, not silently dropped).
    expect(
      /sign[\s-]*in/i.test(md) && /sign[\s-]*up/i.test(md),
      'The coverage matrix only lists this endpoint — record the other abusable endpoints (sign-in, sign-up) as rows so gaps become tickets, not silent decisions.',
    ).toBe(true);
  });
});

describe('Lesson 7 — Finding 006 — the audit stayed read-only (defect still present)', () => {
  it('the reset-password route still fires sendEmail with no limiter in front of it', () => {
    // Strip comments first: the seeded route documents the defect in prose that names
    // safeLimit/resetLimiter, so we must probe the executable code, not the comments.
    const route = fromRoot('src/app/api/auth/reset-password/route.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    // The seeded defect: the route sends mail on every POST...
    expect(
      /sendEmail\s*\(/.test(route),
      'The reset-password route no longer calls sendEmail — the audit is read-only; document the defect, do not patch the target.',
    ).toBe(true);
    // ...and nothing wires a limiter into it. A fix would import safeLimit or the
    // declared resetLimiter; their absence in executable code is the defect to keep.
    expect(
      /\bimport\b[\s\S]*?\b(safeLimit|resetLimiter)\b/.test(route) ||
        /\b(safeLimit|resetLimiter)\s*\(/.test(route),
      'The reset-password route now imports/calls a limiter (safeLimit/resetLimiter) — the audit is read-only; document the defect, do not patch the target.',
    ).toBe(false);
  });

  it('resetLimiter is still declared in rate-limit.ts but imported by nothing under src/app', () => {
    const limiters = fromRoot('src/lib/rate-limit.ts');

    expect(
      /resetLimiter/.test(limiters),
      'resetLimiter is no longer declared in src/lib/rate-limit.ts — the audit is read-only; the gap is that this limiter exists but is unwired, so it must stay declared.',
    ).toBe(true);
  });
});
