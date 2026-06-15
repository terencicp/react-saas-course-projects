import 'server-only';

// The caller-supplied half of an audit row: the actor/org context is derived by
// logAudit from requireOrgUser + headers, so the event carries only the what.
export type AuditEvent = {
  action: string;
  subjectType?: string;
  subjectId?: string;
  payload?: Record<string, unknown>;
};

// TODO(L3) — logAudit(tx, event): single insert into auditLogs; tx is required (no
// bare-db overload); derive actor/org from requireOrgUser + headers.
export const logAudit = async (
  _tx: unknown,
  _event: AuditEvent,
): Promise<void> => {
  throw new Error('logAudit not implemented');
};
