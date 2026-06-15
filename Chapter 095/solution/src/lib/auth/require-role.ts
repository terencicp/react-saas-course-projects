import 'server-only';

import { requireOrgUser } from '@/lib/auth';
import type { Role } from '@/lib/auth/roles';
import { roleAtLeast } from '@/lib/auth/roles';

// The fail-closed role gate. Resolves the request's { user, orgId, role } from the
// validated session and THROWS when the actor's role is below `required`. A thrown
// check is a refusal, never a pass (080 L1). Callers run it for its throw and let the
// outer authedAction wrapper convert the throw into { ok: false, error } — they must
// NOT swallow it in a try/catch (that is the fail-open anti-pattern seeded defect #1
// plants in lib/admin/transfer-ownership.ts).
export const requireRole = async (
  required: Role,
): Promise<{
  user: Awaited<ReturnType<typeof requireOrgUser>>['user'];
  orgId: string;
  role: Role;
}> => {
  const { user, orgId, role } = await requireOrgUser();
  if (!roleAtLeast(role, required)) {
    throw new Error(`requireRole: ${required} required, actor is ${role}`);
  }
  return { user, orgId, role };
};
