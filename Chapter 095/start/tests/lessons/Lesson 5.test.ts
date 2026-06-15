import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 5 — Finding 004 — gate PostHog behind consent.
//
// This gate is a node-env probe (no DOM, no runtime import of the consent seam):
// the runtime behaviours — zero pre-consent /ingest requests, Accept producing a
// $pageview, Reject stopping capture, a reload resuming capture — are the
// hand-verified requirements (1-4) confirmed on the Network panel + PostHog
// dashboard. Here we assert the OBSERVABLE SHAPE of the artifacts the student
// produces: the rewritten provider source, the single source of truth, the one
// grant/revoke seam (requirements 5-7), and the finding file (requirement 8).
// Unlike a documented-only finding, this lesson FIXES the defect, so the source
// probes assert the gate is present, not that the defect survives.

// Resolve repo files from this test's own location (tests/lessons/ -> repo root)
// so the gate behaves the same regardless of the cwd the runner is invoked from.
const REPO_ROOT = new URL('../../', import.meta.url);
const readRepoFile = (rel: string): string | null => {
  try {
    return readFileSync(new URL(rel, REPO_ROOT), 'utf8');
  } catch {
    return null;
  }
};

const PROVIDERS = 'src/app/_components/providers.tsx';
const CONSENT_PROVIDER = 'src/app/_components/consent-provider.tsx';
const CONSENT_BANNER = 'src/app/_components/consent-banner.tsx';
const CONSENT_SEAM = 'src/lib/analytics/consent.ts';
const FINDING = 'findings/004-posthog-consent-gate.md';

// Strip line and block comments so a probe matches real code, not a TODO note or
// the explanatory header a student might leave describing the old defect.
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

const providersRaw = readRepoFile(PROVIDERS);
const providers = providersRaw ? stripComments(providersRaw) : null;
const consentProviderRaw = readRepoFile(CONSENT_PROVIDER);
const consentProvider = consentProviderRaw
  ? stripComments(consentProviderRaw)
  : null;
const consentBannerRaw = readRepoFile(CONSENT_BANNER);
const consentBanner = consentBannerRaw ? stripComments(consentBannerRaw) : null;
const seamRaw = readRepoFile(CONSENT_SEAM);
const seam = seamRaw ? stripComments(seamRaw) : null;
const finding = readRepoFile(FINDING);

describe('Req 5 — PostHog is initialized with capture off by default', () => {
  it('providers.tsx still defines the Providers component', () => {
    expect(
      providers,
      `${PROVIDERS} is missing or unreadable — the rewritten Providers must live here.`,
    ).not.toBeNull();
  });

  it('inits with opt_out_capturing_by_default: true (belt one)', () => {
    const optOutTrue = /opt_out_capturing_by_default\s*:\s*true/.test(
      providers ?? '',
    );
    expect(
      optOutTrue,
      'providers.tsx does not init PostHog with `opt_out_capturing_by_default: true`. Belt one means capture is off the moment the SDK loads — flip the seeded `false` to `true`.',
    ).toBe(true);
  });

  it('no longer ships the seeded opt_out_capturing_by_default: false', () => {
    const optOutFalse = /opt_out_capturing_by_default\s*:\s*false/.test(
      providers ?? '',
    );
    expect(
      optOutFalse,
      'providers.tsx still carries `opt_out_capturing_by_default: false` — that is the seeded defect (capture on at first paint). Remove it; belt one must be `true`.',
    ).toBe(false);
  });

  it('loads posthog-js through a consent-gated dynamic import (belt two), not at module scope', () => {
    const moduleScopeImport =
      /^\s*import\s+posthog\b[^\n]*from\s+['"]posthog-js['"]/m.test(
        providers ?? '',
      );
    expect(
      moduleScopeImport,
      "providers.tsx still imports posthog-js at module scope (`import posthog from 'posthog-js'`). Belt two keeps the SDK chunk out of the page until consent — load it with a dynamic `import('posthog-js')` on the consented branch.",
    ).toBe(false);

    const dynamicImport = /import\(\s*['"]posthog-js['"]\s*\)/.test(
      providers ?? '',
    );
    expect(
      dynamicImport,
      "providers.tsx never runs a dynamic `import('posthog-js')`. Belt two is the consent-gated dynamic import inside the effect — without it the SDK still ships on first paint.",
    ).toBe(true);
  });
});

describe('Req 6 — one source of truth every consumer reads (ConsentProvider / useConsent)', () => {
  it('consent-provider.tsx exists', () => {
    expect(
      consentProvider,
      `${CONSENT_PROVIDER} is missing or unreadable — the consent decision needs one home (ConsentProvider + useConsent).`,
    ).not.toBeNull();
  });

  it('exports a ConsentProvider and a useConsent hook', () => {
    expect(
      /export\s+(?:const|function)\s+ConsentProvider\b/.test(
        consentProvider ?? '',
      ),
      'consent-provider.tsx does not export `ConsentProvider`. The provider holding the analytics/decided state is the single source of truth.',
    ).toBe(true);
    expect(
      /export\s+(?:const|function)\s+useConsent\b/.test(consentProvider ?? ''),
      'consent-provider.tsx does not export a `useConsent` hook. Every tracker reads the decision through this hook — not its own copy.',
    ).toBe(true);
  });

  it('useConsent throws when read outside the provider', () => {
    expect(
      /throw\s+new\s+Error/.test(consentProvider ?? ''),
      'useConsent does not throw outside a ConsentProvider. A missing provider must fail loudly, not silently hand back an undefined decision.',
    ).toBe(true);
  });

  it('the PostHog gate reads the flag from useConsent rather than its own state', () => {
    expect(
      /useConsent\s*\(/.test(providers ?? ''),
      'providers.tsx never calls `useConsent()`. The gate must read the `analytics` flag from the single source of truth — it must not track consent on its own.',
    ).toBe(true);
  });
});

describe('Req 7 — every grant and revoke routes through the one consent.ts seam', () => {
  it('lib/analytics/consent.ts exists', () => {
    expect(
      seam,
      `${CONSENT_SEAM} is missing or unreadable — grant and revoke must route through one seam so the audit grep has a single place to read.`,
    ).not.toBeNull();
  });

  it('exports grantAnalyticsConsent and revokeAnalyticsConsent', () => {
    expect(
      /export\s+(?:const|async\s+function|function)\s+grantAnalyticsConsent\b/.test(
        seam ?? '',
      ),
      'consent.ts does not export `grantAnalyticsConsent`. The grant path must live in the seam, not inline in the banner.',
    ).toBe(true);
    expect(
      /export\s+(?:const|async\s+function|function)\s+revokeAnalyticsConsent\b/.test(
        seam ?? '',
      ),
      'consent.ts does not export `revokeAnalyticsConsent`. The revoke path must live in the seam too.',
    ).toBe(true);
  });

  it('the seam owns the opt-in / opt-out pair', () => {
    expect(
      /opt_in_capturing\s*\(/.test(seam ?? ''),
      'consent.ts never calls `opt_in_capturing()`. The grant seam is where capture is turned on (belt one is lifted here), not at any call site.',
    ).toBe(true);
    expect(
      /opt_out_capturing\s*\(/.test(seam ?? ''),
      'consent.ts never calls `opt_out_capturing()`. The revoke seam is where capture is turned off.',
    ).toBe(true);
  });

  it('the banner does not reach opt_in_capturing() inline — it goes through the hook', () => {
    expect(
      consentBanner,
      `${CONSENT_BANNER} is missing or unreadable — the banner must route Accept/Reject through the hook.`,
    ).not.toBeNull();

    const bannerOptsInline = /opt_in_capturing\s*\(/.test(consentBanner ?? '');
    expect(
      bannerOptsInline,
      'consent-banner.tsx calls `opt_in_capturing()` directly. The banner must route through `useConsent().accept/reject` → the consent.ts seam, never reach for PostHog inline.',
    ).toBe(false);

    // The hook the banner depends on must itself defer to the seam, not write the
    // cookie or call PostHog inline — that is what keeps the grant/revoke logic in
    // exactly one auditable place. (The PostHog gate in providers.tsx legitimately
    // re-calls opt_in on mount for session continuity, so it is not asserted here.)
    const providerCallsGrant = /grantAnalyticsConsent\s*\(/.test(
      consentProvider ?? '',
    );
    expect(
      providerCallsGrant,
      'consent-provider.tsx never calls `grantAnalyticsConsent()`. Accept must defer to the consent.ts seam rather than opting in or writing the cookie inline.',
    ).toBe(true);
  });
});

describe('Req 8 — findings/004 carries all four sections with the right substance', () => {
  it('reads the finding file at findings/004-posthog-consent-gate.md', () => {
    expect(
      finding,
      `${FINDING} is missing or unreadable — write the finding there.`,
    ).not.toBeNull();
  });

  for (const header of ['Rule', 'Location', 'Consequence', 'Fix']) {
    it(`has a non-empty "## ${header}" section`, () => {
      const body = sectionBody(finding ?? '', header);
      expect(
        body.length,
        `The "## ${header}" section is empty. Fill all four (Rule, Location, Consequence, Fix) — an empty section means the finding is unfinished.`,
      ).toBeGreaterThan(0);
    });
  }

  it('the Rule cites chapter 093 lesson 3 and chapter 081 lesson 5', () => {
    const rule = sectionBody(finding ?? '', 'Rule');
    expect(
      /\b093\b/.test(rule),
      'The Rule section does not cite chapter 093. The consent-gated PostHog init pattern comes from chapter 093 lesson 3 — name it as the rule source.',
    ).toBe(true);
    expect(
      /\b081\b/.test(rule),
      'The Rule section does not cite chapter 081. The cookie-consent discipline ("consent before processing") comes from chapter 081 lesson 5 — name it too.',
    ).toBe(true);
  });

  it('the Location names providers.tsx and the Network surface', () => {
    const location = sectionBody(finding ?? '', 'Location');
    expect(
      /providers\.tsx/i.test(location),
      'The Location section does not name providers.tsx. Point at the seeded ungated init as the source location.',
    ).toBe(true);
    expect(
      /network|\/ingest|ingest|posthog/i.test(location),
      'The Location section does not name the Network surface. The pre-consent `/ingest` request in the Network panel is the user-visible fingerprint — record it.',
    ).toBe(true);
  });

  it('the Fix names the opt-out/opt-in pair and the consent.ts seam', () => {
    const fix = sectionBody(finding ?? '', 'Fix');
    expect(
      /opt_out_capturing_by_default/i.test(fix) &&
        /opt_in_capturing/i.test(fix),
      'The Fix section does not name the opt-out/opt-in pair. Belt one (`opt_out_capturing_by_default: true`) plus the consented-branch `opt_in_capturing()` is the load-bearing pair — name both.',
    ).toBe(true);
    expect(
      /consent\.ts/i.test(fix),
      'The Fix section does not name the consent.ts seam. The fix routes grant/revoke through the single lib/analytics/consent.ts seam — name it.',
    ).toBe(true);
  });
});
