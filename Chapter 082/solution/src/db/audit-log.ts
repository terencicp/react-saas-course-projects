import 'server-only';

import { headers } from 'next/headers';

import type { Transaction } from '@/db';
import type { AuditEvent } from '@/db/audit';
import { auditLogs } from '@/db/audit';
import { requireOrgUser } from '@/lib/auth';

// An explicit-context audit event: org + actor are supplied by the caller, never
// derived from a session. The Stripe webhook has no session (the actor is Stripe,
// not a user), so it passes organizationId from the resolved org and actorUserId:
// null. The discriminant is the presence of `organizationId` on the event.
export type ExplicitAuditEvent = AuditEvent & {
  organizationId: string;
  actorUserId: string | null;
};

const isExplicit = (
  event: AuditEvent | ExplicitAuditEvent,
): event is ExplicitAuditEvent =>
  'organizationId' in event && typeof event.organizationId === 'string';

// The audit writer. Its first arg is the Transaction type with no bare-db overload,
// so an off-transaction call (and the role-changed-but-no-audit-row bug it would
// allow) does not typecheck.
//
// Two call shapes share this writer:
//   - The 059 session path: the caller passes only the event; actor/org context is
//     derived here from requireOrgUser + the request headers (the action call sites).
//   - The webhook path: the caller passes an ExplicitAuditEvent carrying
//     organizationId + actorUserId directly (no session to derive from), bypassing
//     requireOrgUser/headers entirely.
export const logAudit = async (
  tx: Transaction,
  event: AuditEvent | ExplicitAuditEvent,
): Promise<void> => {
  if (isExplicit(event)) {
    await tx.insert(auditLogs).values({
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      actorIp: null,
      actorUserAgent: null,
      action: event.action,
      subjectType: event.subjectType ?? '',
      subjectId: event.subjectId ?? '',
      payload: event.payload ?? {},
    });
    return;
  }

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
