import { signInLimiter } from '@/lib/rate-limit';

// An internal export-trigger ingress (a worker/cron entry point that kicks off an
// export run).
//
// SEEDED AUDIT DEFECT #10 (bonus, finding 10) — safeLimit bypass on a worker
// endpoint (080 L3): this calls `signInLimiter.limit(key)` DIRECTLY instead of
// routing through the `safeLimit` wrapper. `safeLimit` is the single seam where the
// fail-open policy lives — a bare `.limit()` throws on a Redis outage and 500s the
// endpoint (fail-closed by accident, the wrong direction), and it skips the
// operator-honest log every gate is supposed to write. The healthy shape routes
// every limiter call through `safeLimit`. The target ships the bug on purpose; do
// not "fix" it here.
export const POST = async (request: Request): Promise<Response> => {
  const key =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // SEEDED #10: bare limiter.limit() — bypasses the safeLimit fail-open seam.
  const result = await signInLimiter.limit(key);
  if (!result.success) {
    return Response.json({ error: 'Too many requests.' }, { status: 429 });
  }

  // (The actual trigger.dev fire-and-forget would happen here; omitted — the defect
  // is the limiter bypass, not the trigger wiring.)
  return Response.json({ ok: true });
};
