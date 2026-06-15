import { getClientIp } from '@/lib/keys';
import { signInLimiter } from '@/lib/rate-limit';
import {
  rateLimitedResponse,
  rateLimitHeaders,
} from '@/lib/rate-limit-headers';

// The route-handler twin: the ONLY place literal `RateLimit-*` HTTP headers exist.
// It is here for parity so the student can SEE real headers on a route — the auth
// action surface is the project's real enforcement point, and no auth route goes
// through this (the budget rides the action `Result`, headers() being read-only).
//
// This calls `signInLimiter.limit(...)` BARE — no `safeLimit` — because the point is
// to show the raw headers; the auth path always goes through `safeLimit`'s fail-open
// wrapper instead. No `runtime` export (Node default). Lights up once the S1/S3 stubs
// (signInLimiter, getClientIp, the header helpers) are filled.
export const GET = async (request: Request): Promise<Response> => {
  const ip = getClientIp(request.headers);
  const result = await signInLimiter.limit(`demo:${ip}`);

  if (!result.success) {
    return rateLimitedResponse(result);
  }

  return Response.json({ ok: true }, { headers: rateLimitHeaders(result) });
};
