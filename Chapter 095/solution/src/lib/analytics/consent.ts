// The single analytics-consent seam (finding 4, slice S4). Every grant and every
// revoke routes through these two functions — no feature engineer reaches for
// `posthog.opt_in_capturing()` directly, and the consent banner never writes the
// cookie inline. One seam means the audit grep has exactly one place to read.
//
// Belt two is preserved here too: posthog-js is loaded with a dynamic
// `import('posthog-js')` inside each function, so the SDK enters the page only on a
// consented (grant) branch or a teardown (revoke) branch — never on first paint.

// The cookie that records the analytics choice. Essential by the 081 L5 test (the
// record of consent needs no consent of its own), so it is set client-side here and
// read on mount for session continuity. 13-month cap per ePrivacy; SameSite=Lax;
// not HttpOnly because the client reads it on mount to re-call opt-in.
export const ANALYTICS_CONSENT_COOKIE = 'consent_analytics';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

const writeConsentCookie = (granted: boolean) => {
  const maxAge = granted ? COOKIE_MAX_AGE_SECONDS : 0;
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${granted ? '1' : '0'}; path=/; max-age=${maxAge}; SameSite=Lax`;
};

export const hasAnalyticsConsentCookie = () =>
  typeof document !== 'undefined' &&
  document.cookie
    .split('; ')
    .some((entry) => entry === `${ANALYTICS_CONSENT_COOKIE}=1`);

// Grant: lift belt one (`opt_in_capturing`), record the choice in the cookie, and
// capture the one-off `analytics_consent_granted` event (a PostHog event name,
// snake_case — not an audit-log slug). The dynamic import keeps posthog-js out of
// the page until this consented branch runs.
export const grantAnalyticsConsent = async () => {
  writeConsentCookie(true);
  const { default: posthog } = await import('posthog-js');
  posthog.opt_in_capturing();
  posthog.capture('analytics_consent_granted');
};

// Revoke: opt capturing out, reset the queued events and stored identity (withdraw
// is "stop and forget", not "stop future"), and clear the cookie.
export const revokeAnalyticsConsent = async () => {
  writeConsentCookie(false);
  const { default: posthog } = await import('posthog-js');
  posthog.opt_out_capturing();
  posthog.reset();
};
