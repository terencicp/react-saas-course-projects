'use client';

import { ThemeProvider } from 'next-themes';
import posthog, { type PostHogConfig } from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { type ReactNode, useEffect } from 'react';

import { env } from '@/env';

// SEEDED AUDIT DEFECT #4 (finding 4, L5) — PostHog consent gate missing (093 L3 + 081
// L5): PostHog is initialized with `opt_out_capturing_by_default: false` and there is
// NO consent provider anywhere in src/app, so PostHog fires a network request on the
// first page load, before the user has consented — the pre-consent rule violation.
//
// TODO(L5) — gate PostHog: dynamic import + opt_out_capturing_by_default: true + route
// grant/revoke through lib/analytics/consent.ts. The healthy shape is the two-belt gate
// (`opt_out_capturing_by_default: true` + a dynamic `import('posthog-js')` that only runs
// after consent is recorded), nested under a ConsentProvider, with grant/revoke routed
// through the single lib/analytics/consent.ts seam and a session-continuity re-call of
// opt_in_capturing() on mount when the cookie is present. See
// findings/004-posthog-consent-gate.md.
export const Providers = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    // The config carries the runtime-supported `opt_out_capturing_by_default` key.
    // posthog-js 1.386.6 omits this key from its public PostHogConfig type and its
    // `init` overload rejects unknown keys (OnlyValidKeys), so the object is typed
    // through a local extension and passed as Partial<PostHogConfig> — the installed
    // surface wins (deviation from the plan's bare `init({ opt_out_… })` call). The
    // literal `opt_out_capturing_by_default: false` stays in source: it IS seeded
    // defect #4 (capturing on by default, no consent gate).
    const config: Partial<PostHogConfig> & {
      opt_out_capturing_by_default: boolean;
    } = {
      api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
      // SEEDED #4: capturing is ON by default — no consent gate.
      opt_out_capturing_by_default: false,
    };
    posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, config as Partial<PostHogConfig>);
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </PostHogProvider>
  );
};
