'use client';

import { createContext, type ReactNode, use, useEffect, useState } from 'react';

import {
  grantAnalyticsConsent,
  hasAnalyticsConsentCookie,
  revokeAnalyticsConsent,
} from '@/lib/analytics/consent';

// The single source of truth for analytics consent (081 L5). Every tracker reads the
// `analytics` flag from here and short-circuits when it is false; there is no second
// place that knows the answer. `decided` distinguishes the not-yet-chosen state (show
// the banner) from an explicit reject (banner dismissed, flag still off) — both
// collapse to `analytics: false`, so nothing fires before the click.
type ConsentValue = {
  analytics: boolean;
  decided: boolean;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
};

const ConsentContext = createContext<ConsentValue | null>(null);

export const ConsentProvider = ({ children }: { children: ReactNode }) => {
  // Both flags start off so the server render and the first client render agree (no
  // hydration mismatch — `document.cookie` is unreadable on the server). A returning
  // visitor's cookie is hydrated in the mount effect below; the PostHogGate (in
  // providers.tsx) re-calls opt-in for session continuity, so capture resumes after
  // the reload.
  const [analytics, setAnalytics] = useState(false);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    if (hasAnalyticsConsentCookie()) {
      setAnalytics(true);
      setDecided(true);
    }
  }, []);

  const accept = async () => {
    await grantAnalyticsConsent();
    setAnalytics(true);
    setDecided(true);
  };

  const reject = async () => {
    await revokeAnalyticsConsent();
    setAnalytics(false);
    setDecided(true);
  };

  return (
    <ConsentContext value={{ analytics, decided, accept, reject }}>
      {children}
    </ConsentContext>
  );
};

export const useConsent = () => {
  const value = use(ConsentContext);
  if (!value) {
    throw new Error('useConsent must be used within a ConsentProvider');
  }
  return value;
};
