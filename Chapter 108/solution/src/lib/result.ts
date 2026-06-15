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
        // `fieldErrors` carries per-field validation messages.
        fieldErrors?: Record<string, string[]>;
        // `current` is a sibling of the other error fields — only the
        // `'conflict'` branch populates it with the row the server holds now.
        current?: unknown;
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

// A conflict carries the server's current value as a sibling field (not a new
// code, not folded into `fieldErrors`) so the caller can offer refresh-and-retry.
export const conflict = <T>(
  userMessage: string,
  current: T,
): Result<never> => ({
  ok: false,
  error: { code: 'conflict', userMessage, current },
});
