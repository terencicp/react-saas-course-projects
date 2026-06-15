// The `Result` contract — every action returns this, never a per-action variant.

export type ErrorCode =
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'internal';

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        userMessage: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = (
  code: ErrorCode,
  userMessage: string,
  fieldErrors?: Record<string, string[]>,
): Result<never> => ({
  ok: false,
  error: { code, userMessage, fieldErrors },
});

// Detect a Postgres unique-violation (SQLSTATE 23505) so a duplicate maps to a
// `conflict` instead of a 500. postgres-js wraps the driver error and exposes
// the SQLSTATE on `error.cause`, not the top-level object — check `cause`.
export const isUniqueViolation = (e: unknown): boolean => {
  if (typeof e !== 'object' || e === null) {
    return false;
  }
  const cause = (e as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === '23505'
  );
};
