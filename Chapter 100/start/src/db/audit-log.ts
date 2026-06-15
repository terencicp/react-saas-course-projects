import 'server-only';

import { headers } from 'next/headers';

import type { Transaction } from '@/db';
import type { AuditEvent } from '@/db/audit';
import { auditLogs } from '@/db/audit';
import { requireOrgUser } from '@/lib/auth';

// The audit writer. Its first arg is the Transaction type with no bare-db overload,
// so an off-transaction call (and the role-changed-but-no-audit-row bug it would
// allow) does not typecheck. The caller passes only the event; actor/org context is
// derived here from requireOrgUser + the request headers, never trusted from input.
export const logAudit = async (
  tx: Transaction,
  event: AuditEvent,
): Promise<void> => {
  const { user, orgId } = await requireOrgUser();
  const h = await headers();

  await tx.insert(auditLogs).values({
    organizationId: orgId,
    actorUserId: user.id,
    actorIp: h.get('x-forwarded-for'),
    actorUserAgent: h.get('user-agent')?.slice(0, 512),
    action: event.action,
    subjectType: event.subjectType ?? '',
    subjectId: event.subjectId ?? '',
    payload: event.payload ?? {},
  });
};
