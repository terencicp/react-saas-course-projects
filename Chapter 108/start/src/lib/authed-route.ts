import 'server-only';

import { z } from 'zod';
import { getFlag } from '@/server/inspector-flags';
import { getSession, type Session } from '@/server/session';
import { organizations } from '@/server/store';
import type { Organization, Role } from '@/server/types';
import { roleAtLeast } from '@/server/types';

// A thin store facade shaped like the Drizzle `db.query.*` reads the route uses.
// Today it only needs to look up an org by id (for the display name the system
// prompt templates) — the route never touches the raw store array.
const db = {
  query: {
    organization: {
      findFirst: async (args: {
        where: (org: Organization) => boolean;
      }): Promise<Organization | undefined> => organizations.find(args.where),
    },
  },
};

export type RouteCtx = {
  session: Session;
  orgId: string;
  userId: string;
  role: Role;
  db: typeof db;
};

// The Request/Response twin of `authedAction` — the streaming chat's auth
// boundary. Resolve identity → authorize → parse → call `fn` (which returns the
// Response, streamed or JSON; the wrapper does NOT wrap a success Response).
// Refusals are typed Result-shaped JSON with the status table: 401 no identity,
// 403 role, 400/422 parse, 500 throw. (429 quota is the `withLlmQuota` wrapper
// composed AROUND this — not this wrapper's job.)
//
// GET requests carry no body; an absent/empty body parses as `{}` so a handler
// guarded by `z.strictObject({})` passes.
export const authedRoute =
  <TSchema extends z.ZodType, _TOut>(
    role: Role,
    schema: TSchema,
    fn: (input: z.infer<TSchema>, ctx: RouteCtx) => Promise<Response>,
  ) =>
  async (req: Request): Promise<Response> => {
    try {
      // The inspector's `BYPASS_AUTHED_ROUTE` stands in for the unauthenticated
      // request the cookie dev-session never produces — the only path to a 401
      // in dev. In real Better Auth this branch is `requireOrgUser()` 401-ing.
      if (getFlag('BYPASS_AUTHED_ROUTE')) {
        return Response.json(
          {
            ok: false,
            error: {
              code: 'unauthorized',
              userMessage: 'Please sign in to continue.',
            },
          },
          { status: 401 },
        );
      }

      const session = await getSession();

      if (!roleAtLeast(session.role, role)) {
        return Response.json(
          {
            ok: false,
            error: {
              code: 'forbidden',
              userMessage: 'You do not have permission to do this.',
            },
          },
          { status: 403 },
        );
      }

      const body = await readJsonBody(req);
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          {
            ok: false,
            error: {
              code: 'validation',
              userMessage: 'Check the request body.',
              fieldErrors: z.flattenError(parsed.error).fieldErrors,
            },
          },
          { status: 422 },
        );
      }

      return await fn(parsed.data, {
        session,
        orgId: session.orgId,
        userId: session.userId,
        role: session.role,
        db,
      });
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: 'internal',
            userMessage: 'Something went wrong. Please try again.',
          },
        },
        { status: 500 },
      );
    }
  };

// Treat an absent or empty body as `{}` so a GET against `z.strictObject({})`
// passes; a present-but-malformed body falls through to the schema's 422.
const readJsonBody = async (req: Request): Promise<unknown> => {
  const text = await req.text();
  if (text.trim() === '') {
    return {};
  }
  return JSON.parse(text);
};
