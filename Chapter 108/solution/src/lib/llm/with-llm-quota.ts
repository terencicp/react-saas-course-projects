import 'server-only';

import { reserveQuotaOrRefuse } from '@/lib/llm/quota';
import { getSession } from '@/server/session';

// The daily-quota seam, composed AROUND `authedRoute` — `withLlmQuota(authedRoute(...))`.
// Quota lives here, not inside the route, so a new LLM route cannot forget cost
// enforcement: wrap first, then add capability. It reserves before the stream
// starts (reserve-before-spend) and short-circuits a typed 429 when the user is
// at or over the cap; otherwise it delegates to the wrapped handler untouched.
export const withLlmQuota =
  (handler: (req: Request) => Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    const session = await getSession();
    const reserved = await reserveQuotaOrRefuse(session.userId);

    if (!reserved.ok) {
      return Response.json(
        { ok: false, error: reserved.error },
        { status: 429 },
      );
    }

    return handler(req);
  };
