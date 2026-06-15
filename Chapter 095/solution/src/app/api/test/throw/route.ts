// The deliberate-throw proof target (finding 1). Hitting `GET /api/test/throw`
// throws so the student can verify the Sentry wiring: in the seeded-broken state
// (Sentry not wired) the framework renders the default error page and produces NO
// Sentry event; after slice S2 wires Sentry, the same throw lands decoded in the
// Sentry dashboard. Provided in both trees — it is the proof target, not student work.
//
// `await connection()` opts the handler out of build-time prerender (the
// cacheComponents-compatible way to be dynamic) so the throw happens per-request — the
// proof — rather than at build, where it would fail `next build`.
import { connection } from 'next/server';

export async function GET() {
  await connection();
  throw new Error('Sentry smoke test');
}
