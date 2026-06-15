import { z } from 'zod';
import { authedRoute } from '@/lib/authed-route';
import { readUsage } from '@/lib/llm/quota';

// The usage endpoint the token panel polls. GET carries no body, so it parses
// against `z.strictObject({})` (the wrapper treats an absent body as `{}`); the
// auth wrap resolves the acting user from the session closure, never the request.
export const GET = authedRoute(
  'member',
  z.strictObject({}),
  async (_input, ctx) => Response.json(await readUsage(ctx.userId)),
);
