import * as Sentry from '@sentry/nextjs';

import { redact } from '@/lib/logger';
import { getRequestContext } from '@/lib/request-context';

// The server-runtime Sentry client (Node). Loaded by instrumentation.ts's `register`
// when NEXT_RUNTIME === 'nodejs'. Config files read process.env directly — they run
// before the env module's createEnv boundary and the Sentry build keys are documented,
// not consumed, in src/env.ts (slice S2).
//
// The release is computed from the deploy's commit SHA so a regression maps to the
// deploy that introduced it; in local dev VERCEL_GIT_COMMIT_SHA is unset, so it falls
// back to a static dev marker rather than a hardcoded version that would tie a week of
// errors to one string (092 L1).
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release,
  // 1.0 locally for full visibility while wiring; production drops to 0.1–0.2 because
  // traces cost more than error events (092 L1).
  tracesSampleRate: 1.0,
  // The second caller of the single `redact` seam from lib/logger.ts ("one redactor,
  // two callers", finding 2): every event runs through the same scrubber, so a secret
  // named in the drop-list never reaches Sentry either.
  //
  // The requestId join (finding 3) happens HERE — inside beforeSend — because it runs
  // per event with the request scope live; reading getRequestContext() at module scope
  // would run once at boot with no request and attach nothing. The id rides as context
  // (high-cardinality), never a tag, so a log line and its Sentry event join on one
  // value (092 L2).
  beforeSend: (event) => {
    const scrubbed = redact(event);
    const requestId = getRequestContext()?.requestId;
    if (requestId !== undefined) {
      scrubbed.contexts = {
        ...scrubbed.contexts,
        request: { ...scrubbed.contexts?.request, requestId },
      };
    }
    return scrubbed;
  },
});
