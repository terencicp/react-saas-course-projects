import 'server-only';

// The pending-invites panel's row view. acceptUrl is omitted at rest (the raw token
// is never stored — only its sha256), so a pending row cannot reconstruct its signed
// URL; the seed prints the one known URL and the dev Copy button reads it from there.
export type PendingInvitationRow = {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
  acceptUrl?: string;
  user: { name: string; email: string } | null;
};

// TODO(L5) — listPendingInvitations(orgId) via tenantDb, expiry in the where.
// Returns an empty list so the inspector's pending panel renders its empty state.
export const listPendingInvitations = async (
  _orgId: string,
): Promise<PendingInvitationRow[]> => [];

// TODO(L6) — getInvitationById(id): unwrapped db read (token is the authz, not
// tenancy). Returns null until L6.
export const getInvitationById = async (_id: string) => null;
