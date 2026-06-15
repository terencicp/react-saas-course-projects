import 'server-only';

import { APIError } from 'better-auth/api';

import { err, type Result } from '@/lib/result';

// Maps a Better Auth failure to the carried-in 7-code Result union (Ch053 L2).
// Keys on the numeric HTTP status where possible (version-stable across code-string
// churn), then on the error code string:
//   INVALID_EMAIL_OR_PASSWORD → unauthorized  (wrong email AND wrong password both
//                                               collapse here — opaque, enumeration-safe)
//   EMAIL_NOT_VERIFIED        → forbidden      (the sign-in form's resend branch)
//   status 429                → rate_limited
//   anything else             → internal
//
// There is deliberately NO taken-email branch: under autoSignIn:false a duplicate
// sign-up returns generic success, so enumeration is closed at the source (Ch053 L1)
// and never reaches this mapper.
export const mapAuthError = (error: unknown): Result<never> => {
  if (error instanceof APIError) {
    // Installed better-call sets `status` to the string name (e.g.
    // 'TOO_MANY_REQUESTS') and carries the HTTP number on `statusCode` — key on
    // the numeric `statusCode` for the version-stable rate-limit branch.
    if (error.statusCode === 429) {
      return err('rate_limited', 'Too many attempts. Try again shortly.');
    }

    const code = error.body?.code;
    if (code === 'INVALID_EMAIL_OR_PASSWORD') {
      return err('unauthorized', 'Invalid email or password.');
    }
    if (code === 'EMAIL_NOT_VERIFIED') {
      return err('forbidden', 'Verify your email before signing in.');
    }
  }

  return err('internal', 'Something went wrong. Try again.');
};
