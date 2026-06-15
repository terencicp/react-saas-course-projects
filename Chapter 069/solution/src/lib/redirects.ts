import 'server-only';

// The open-redirect guard (Chapter 053 L2 / Chapter 054 L1). The sign-in action
// passes the `?next=` value through here before redirecting; anything that is not
// a same-origin path returns `undefined` and the caller falls back to /dashboard.
//
// Accepts only a string that starts with a single `/`, does NOT start with `//`
// (rejects protocol-relative `//evil.com`), and contains no `:` (rejects absolute
// `https://…` and `javascript:` URLs).
export const safeNext = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') {
    return undefined;
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes(':')) {
    return undefined;
  }
  return raw;
};
