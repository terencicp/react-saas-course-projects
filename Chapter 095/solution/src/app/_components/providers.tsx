'use client';

import { ThemeProvider } from 'next-themes';
import type { PostHogConfig } from 'posthog-js';
import { type ReactNode, useEffect } from 'react';

import { ConsentBanner } from '@/app/_components/consent-banner';
import {
  ConsentProvider,
  useConsent,
} from '@/app/_components/consent-provider';
import { env } from '@/env';
import { hasAnalyticsConsentCookie } from '@/lib/analytics/consent';

// Finding 4 (slice S4) — PostHog gated behind consent (093 L3 + 081 L5). The ungated
// `posthog.init(key, { opt_out_capturing_by_default: false })` is gone, replaced by the
// two-belt model. Belt two: PostHogGate runs a dynamic `import('posthog-js')` only on
// the consented branch, so the SDK never enters the page until `analytics` is true.
// Belt one: init carries `opt_out_capturing_by_default: true`, so even a loaded module
// captures nothing until `opt_in_capturing()` is called on the consented path.
//
// posthog-js 1.386.6 omits `opt_out_capturing_by_default` from its public PostHogConfig
// type and `init` rejects unknown keys (OnlyValidKeys), so the config is typed through a
// local extension and passed as Partial<PostHogConfig> — the installed surface wins
// (deviation from the plan's bare init({ opt_out_… }) call).
type ConsentGatedConfig = Partial<PostHogConfig> & {
  opt_out_capturing_by_default: boolean;
};

// Belt two. Reads the single `analytics` flag from useConsent() and short-circuits when
// it is false (the default, a reject, or undecided — all collapse to "off"). The
// dynamic import below is never reached pre-consent, so no posthog-js chunk loads.
const PostHogGate = ({ children }: { children: ReactNode }) => {
  const { analytics } = useConsent();

  useEffect(() => {
    if (!analytics) {
      return;
    }

    let cancelled = false;
    void import('posthog-js').then(({ default: posthog }) => {
      if (cancelled) {
        return;
      }
      const config: ConsentGatedConfig = {
        api_host: '/ingest',
        ui_host: 'https://eu.posthog.com',
        defaults: '2026-01-30',
        capture_pageview: false,
        opt_out_capturing_by_default: true,
      };
      posthog.init(
        env.NEXT_PUBLIC_POSTHOG_KEY,
        config as Partial<PostHogConfig>,
      );
      // Session continuity: init runs with capture off after a reload, so a returning
      // visitor whose cookie is already set must be opted back in here.
      if (hasAnalyticsConsentCookie()) {
        posthog.opt_in_capturing();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [analytics]);

  return <>{children}</>;
};

// ConsentProvider is the single source of truth for the `analytics` flag and must sit
// above PostHogGate — the gate calls useConsent(). Grant/revoke route through the one
// lib/analytics/consent.ts seam via the banner.
export const Providers = ({ children }: { children: ReactNode }) => (
  <ConsentProvider>
    <PostHogGate>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <ConsentBanner />
      </ThemeProvider>
    </PostHogGate>
  </ConsentProvider>
);
