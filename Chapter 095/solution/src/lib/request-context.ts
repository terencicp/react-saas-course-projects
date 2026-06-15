import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

// The request-scoped correlation context (finding 3, slice S3). Each request opens
// its own scope over AsyncLocalStorage — never module-level state, which would bleed
// one request's id into the next under concurrency. `requestId` is the join key; the
// optional `userId`/`orgId` ride along once a seam knows them so a log line, a Sentry
// event, and a downstream service all point at the same request.
export type RequestContext = {
  requestId: string;
  userId?: string;
  orgId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore();
