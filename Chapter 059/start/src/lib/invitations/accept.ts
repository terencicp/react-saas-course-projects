'use server';

import type { Result } from '@/lib/result';
import { err } from '@/lib/result';

// TODO(L6) — acceptInvitation (NOT authedAction): re-verify (hash/expiry/status),
// email match, then member insert + invitation status flip (where status='pending') +
// emailVerified + setActiveOrganization + logAudit in one withTenant tx; redirect
// /dashboard.
//
// 'use server': the accept-form island (built in L6) imports acceptInvitation and
// passes it to useActionState.
export const acceptInvitation = async (
  _prev: Result<{ ok: true }> | null,
  _formData: FormData,
): Promise<Result<{ ok: true }>> => err('internal', 'Not implemented');
