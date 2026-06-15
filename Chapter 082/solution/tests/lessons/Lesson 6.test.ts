import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 6 — Finding 005 — the secret in NEXT_PUBLIC_* (env.ts + settings/resend-test.tsx).
//
// Authored at projects/Chapter 082/start/lesson-verification/Lesson 6.ts; this is the
// runner-located copy `pnpm test:lesson 6` executes (tests/lessons/Lesson N.test.ts).
//
// This gate is self-contained: it imports only vitest + node:fs and reads the
// committed artifacts by path. It asserts the observable shape of the deliverable
// (findings/005-secret-next-public.md) and a source-shape probe proving the audit
// stayed read-only (the seeded defect is still present in the target).
//
// The project root is two directories up from this tests/lessons/ folder. Keep the
// base a URL (never fileURLToPath it): a file: URL is a valid new URL() base and
// tolerates spaces in the path; a bare path would throw "Invalid URL".
const fromRoot = (rel: string) =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

// The finding the student writes this lesson.
const finding = (): string => {
  try {
    return fromRoot('findings/005-secret-next-public.md');
  } catch {
    throw new Error(
      'Could not read findings/005-secret-next-public.md — write the finding into this file before running the test.',
    );
  }
};

// Split a finding's markdown into { header -> body } keyed by the `## Header` lines,
// so "populated" means there is real prose under a section, not just the heading.
const sections = (md: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const parts = md.split(/^##\s+/m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf('\n');
    const name = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? '' : part.slice(newline + 1);
    // Strip TODO comments so a leftover skeleton hint never reads as content.
    out[name] = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  return out;
};

describe('Lesson 6 — Finding 005 — the four template sections are populated', () => {
  it('Rule, Location, Consequence, and Fix each carry real prose', () => {
    const s = sections(finding());
    for (const name of ['Rule', 'Location', 'Consequence', 'Fix']) {
      expect(
        s[name],
        `The finding is missing a "## ${name}" section header — it must keep all four template sections (Rule, Location, Consequence, Fix).`,
      ).toBeTypeOf('string');
      expect(
        (s[name] ?? '').length,
        `The "## ${name}" section is empty or still the skeleton — write the ${name} content into findings/005-secret-next-public.md.`,
      ).toBeGreaterThan(40);
    }
  });
});

describe('Lesson 6 — Finding 005 — the rule and its env split are named', () => {
  it('cites the NEXT_PUBLIC_ secrets rule plus chapter 081 lessons 6 and 7', () => {
    const md = finding();
    const rule = sections(md).Rule ?? '';

    expect(
      /NEXT_PUBLIC_/.test(rule),
      'The Rule section never mentions NEXT_PUBLIC_ — name the prefix that is the one path into the browser bundle.',
    ).toBe(true);
    expect(
      /\bsecret/i.test(rule),
      'The Rule section never says the value is a secret — state that a secret must not be named NEXT_PUBLIC_*.',
    ).toBe(true);
    expect(
      /server[\s/]*\/?\s*client|client\/server/i.test(rule),
      'The Rule section never names the server/client env split that the prefix bypassed.',
    ).toBe(true);
    // Cite both source lessons: chapter 081, lessons 6 and 7.
    expect(
      /081[\s\S]*lesson\s*6|lesson\s*6[\s\S]*081/i.test(md),
      'The finding never cites chapter 081 lesson 6 (the secrets rule) — cite it by section.',
    ).toBe(true);
    expect(
      /081[\s\S]*lesson\s*7|lesson\s*7[\s\S]*081/i.test(md),
      'The finding never cites chapter 081 lesson 7 (the env validation split) — cite it by section.',
    ).toBe(true);
  });
});

describe('Lesson 6 — Finding 005 — the location is evidence-backed', () => {
  it('names a discovery grep and the resend-test.tsx call site', () => {
    const location = sections(finding()).Location ?? '';

    // A discovery command: the leak greps run rg/grep over the secret name.
    expect(
      /\b(rg|grep)\b/.test(location) && /NEXT_PUBLIC_/.test(location),
      'The Location section names no discovery command — show the leak grep (e.g. `rg -n NEXT_PUBLIC_ src/env.ts`) that surfaced the secret.',
    ).toBe(true);
    // The browser call site that reads the leaked key.
    expect(
      /resend-test\.tsx/.test(location),
      'The Location section never names the call site src/app/(protected)/settings/resend-test.tsx where the key is read in the browser.',
    ).toBe(true);
  });
});

describe('Lesson 6 — Finding 005 — the audit stayed read-only (defect still present)', () => {
  it('NEXT_PUBLIC_RESEND_API_KEY is still in the env.ts client partition', () => {
    const env = fromRoot('src/env.ts');

    // The secret name must still be declared, and inside the `client` partition —
    // a fix would have moved/deleted it. We slice from `client:` to `runtimeEnv:`.
    const clientStart = env.indexOf('client:');
    const runtimeStart = env.indexOf('runtimeEnv:');
    const clientPartition =
      clientStart !== -1 && runtimeStart > clientStart
        ? env.slice(clientStart, runtimeStart)
        : '';

    expect(
      clientPartition.includes('NEXT_PUBLIC_RESEND_API_KEY'),
      'NEXT_PUBLIC_RESEND_API_KEY is no longer in the env.ts client partition — the audit is read-only; document the defect, do not patch the target.',
    ).toBe(true);
  });

  it('resend-test.tsx is still a client component reading the leaked key', () => {
    const callSite = fromRoot('src/app/(protected)/settings/resend-test.tsx');

    expect(
      /['"]use client['"]/.test(callSite),
      'resend-test.tsx is no longer a "use client" component — the audit is read-only; do not change the target.',
    ).toBe(true);
    expect(
      callSite.includes('NEXT_PUBLIC_RESEND_API_KEY'),
      'resend-test.tsx no longer reads env.NEXT_PUBLIC_RESEND_API_KEY — the audit is read-only; document the defect, do not patch it.',
    ).toBe(true);
  });
});
