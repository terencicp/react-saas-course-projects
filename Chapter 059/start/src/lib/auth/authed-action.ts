import 'server-only';

import type { z } from 'zod';

import type { tenantDb } from '@/db/tenant';
import type { Role } from '@/lib/auth/roles';
import { err, type Result } from '@/lib/result';

type OrgUser = { id: string; name: string; email: string };

export type AuthedCtx = {
  user: OrgUser;
  orgId: string;
  role: Role;
  db: ReturnType<typeof tenantDb>;
  ip: string | null;
  userAgent: string | null;
};

// TODO(L4) — authedAction(role, schema, fn): four steps requireOrgUser → roleAtLeast
// → safeParse → fn(ctx); ctx carries tenantDb(orgId) + ip + userAgent; refusals
// return Result, never throw.
export const authedAction =
  <TSchema extends z.ZodType, TOut>(
    _role: Role,
    _schema: TSchema,
    _fn: (input: z.infer<TSchema>, ctx: AuthedCtx) => Promise<Result<TOut>>,
  ) =>
  async (
    _prev: Result<TOut> | null,
    _formData: FormData,
  ): Promise<Result<TOut>> =>
    err('internal', 'Not implemented');
