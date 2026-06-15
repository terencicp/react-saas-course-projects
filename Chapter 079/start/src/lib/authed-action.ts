import 'server-only';

import { z } from 'zod';
import { err, type Result } from '@/lib/result';
import { getSession, type Session } from '@/server/session';
import type { Role } from '@/server/types';
import { roleAtLeast } from '@/server/types';

export type AuthedCtx = {
  session: Session;
  orgId: string;
  userId: string;
  role: Role;
};

// The only privileged Server Action shape. Resolve the session → authorize (the
// cheapest gate fails fastest) → parse → call `fn`. Refusals return a Result,
// never throw: a throw 500s the action and loses the typed contract that
// `useActionState` renders. The whole body is wrapped in try/catch that defaults
// to deny, so an unexpected error surfaces as an `internal` Result, not a crash.
export const authedAction =
  <TSchema extends z.ZodType, TOut>(
    role: Role,
    schema: TSchema,
    fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>,
  ) =>
  async (
    _prev: Result<TOut> | null,
    formData: FormData,
  ): Promise<Result<TOut>> => {
    try {
      const session = await getSession();

      if (!roleAtLeast(session.role, role)) {
        return err('forbidden', 'You do not have permission to do this.');
      }

      const parsed = schema.safeParse(Object.fromEntries(formData));
      if (!parsed.success) {
        return err(
          'validation',
          'Check the highlighted fields.',
          z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
        );
      }

      return await fn(parsed.data, {
        session,
        orgId: session.orgId,
        userId: session.userId,
        role: session.role,
      });
    } catch {
      return err('internal', 'Something went wrong. Please try again.');
    }
  };

// The direct-input twin of `authedAction`. The FormData wrapper returns
// `(prev, formData) => …`, a shape that cannot be called with a plain object —
// the wizard's submit already holds its payload parsed in the client store, so
// it calls `createCustomer(input)` directly. Same pipeline (session → authorize
// → parse → call), but `fn` receives the validated object and the caller gets a
// `(input) => Promise<Result>` it can `await` inside a transition.
export const authedInputAction =
  <TSchema extends z.ZodType, TOut>(
    role: Role,
    schema: TSchema,
    fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>,
  ) =>
  async (input: z.infer<TSchema>): Promise<Result<TOut>> => {
    try {
      const session = await getSession();

      if (!roleAtLeast(session.role, role)) {
        return err('forbidden', 'You do not have permission to do this.');
      }

      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return err(
          'validation',
          'Check the highlighted fields.',
          z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
        );
      }

      return await fn(parsed.data, {
        session,
        orgId: session.orgId,
        userId: session.userId,
        role: session.role,
      });
    } catch {
      return err('internal', 'Something went wrong. Please try again.');
    }
  };
