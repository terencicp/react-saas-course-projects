import 'server-only';

import { headers } from 'next/headers';
import { z } from 'zod';
import { tenantDb } from '@/db/tenant';
import { requireOrgUser } from '@/lib/auth';
import type { Role } from '@/lib/auth/roles';
import { roleAtLeast } from '@/lib/auth/roles';
import { err, type Result } from '@/lib/result';

type OrgUser = Awaited<ReturnType<typeof requireOrgUser>>['user'];

export type AuthedCtx = {
  user: OrgUser;
  orgId: string;
  role: Role;
  db: ReturnType<typeof tenantDb>;
  ip: string | null;
  userAgent: string | null;
};

// The only privileged Server Action shape. Four fixed-order steps — resolve →
// authorize → parse → call — authorizing before parse so the cheapest gate fails
// fastest. Refusals return a Result (never throw): a throw 500s the action and loses
// the typed contract useActionState renders. The one correct throw is requireOrgUser's
// redirect, which propagates. No logging / entitlements / rate-limit steps live here.
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
    const { user, orgId, role: actual } = await requireOrgUser();

    if (!roleAtLeast(actual, role)) {
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

    const h = await headers();
    return fn(parsed.data, {
      user,
      orgId,
      role: actual,
      db: tenantDb(orgId),
      ip: h.get('x-forwarded-for'),
      userAgent: h.get('user-agent'),
    });
  };
