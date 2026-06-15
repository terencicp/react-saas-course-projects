import 'server-only';

import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { getSession, type Session } from '@/server/session';
import type { Role } from '@/server/types';
import { roleAtLeast } from '@/server/types';

// The read-seam twin of `authedAction`: a route-handler wrapper for the public
// GET contract the client fetcher hits. Same pipeline shape — resolve the
// in-memory session → `roleAtLeast` gate → Zod-parse the query string → call
// `fn`. Refusals are Problem-Details JSON (RFC 9457) with the matching status,
// so a client `!res.ok` check surfaces a typed failure instead of a crash.

export type RouteCtx = {
  session: Session;
  orgId: string;
  userId: string;
  role: Role;
  params: { id: string };
};

type ProblemBody = {
  type: string;
  title: string;
  status: number;
  detail?: string;
};

const problem = (status: number, title: string, detail?: string): Response =>
  Response.json(
    {
      type: 'about:blank',
      title,
      status,
      ...(detail ? { detail } : {}),
    } satisfies ProblemBody,
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

// Next 16 passes dynamic params as a Promise on the second handler argument.
type RouteContext = { params: Promise<{ id: string }> };

export const authedRoute =
  <TSchema extends z.ZodType>(
    role: Role,
    schema: TSchema,
    fn: (
      query: z.infer<TSchema>,
      ctx: RouteCtx,
    ) => Promise<Response> | Response,
  ) =>
  async (request: NextRequest, context: RouteContext): Promise<Response> => {
    try {
      const session = await getSession();

      if (!roleAtLeast(session.role, role)) {
        return problem(403, 'Forbidden', 'You do not have access to this.');
      }

      const { id } = await context.params;
      const url = new URL(request.url);
      const parsed = schema.safeParse(
        Object.fromEntries(url.searchParams.entries()),
      );
      if (!parsed.success) {
        return problem(400, 'Bad Request', 'The query is malformed.');
      }

      return await fn(parsed.data, {
        session,
        orgId: session.orgId,
        userId: session.userId,
        role: session.role,
        params: { id },
      });
    } catch {
      return problem(500, 'Internal Server Error');
    }
  };
