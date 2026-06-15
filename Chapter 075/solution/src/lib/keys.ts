// The limiter-key parse helpers. `x-forwarded-for` is the trust boundary: on
// Vercel the platform sets it, so the first entry is the real client IP. The
// 'unknown' fallback is deliberately loose — strict rejection of a missing/spoofed
// forwarded chain is Chapter 081. `normalizeEmail` is trim+lowercase only (no
// +-alias stripping); the same normalization runs at the limiter key and the DB
// lookup, so an alias and its base address stay distinct keys on purpose.
export const getClientIp = (headers: Headers): string => {
  const forwardedFor = headers.get('x-forwarded-for');
  const first = forwardedFor?.split(',')[0]?.trim();
  if (first) {
    return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
};

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
