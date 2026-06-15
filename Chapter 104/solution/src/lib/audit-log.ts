import 'server-only';

import { pushAudit } from '@/server/store';

// The canonical audit-log seam (chapter 057 audit-log catalog). Every
// security-relevant mutation writes one `entity.verb-pasttense` event here, inside
// the same transaction as the write, so the compliance trail can never disagree
// with the data. In the DB-backed framing `tx` is the Drizzle transaction handle
// and this is an INSERT into `audit_logs`; here `tx` is the in-memory store
// handle — a typed alias carrying the acting org + user the row is attributed to.

export type AuditTx = {
  orgId: string;
  actorUserId: string;
};

export type AuditEvent = {
  // `entity.verb-pasttense`, single dot — e.g. `organization.plan-label-changed`.
  action: string;
  subjectType?: string;
  subjectId?: string;
  payload?: Record<string, unknown>;
};

// Push one audit row for `event`, attributed to the org + user on `tx`. Call this
// inside the mutation's transaction, never after the redirect — an audit write
// that races the commit can record a change that rolled back.
export const logAudit = (tx: AuditTx, event: AuditEvent): void => {
  pushAudit({
    orgId: tx.orgId,
    actorUserId: tx.actorUserId,
    action: event.action,
    subjectId: event.subjectId ?? tx.orgId,
    subjectType: event.subjectType,
    payload: event.payload,
  });
};
