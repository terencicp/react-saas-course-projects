'use server';

import { err } from '@/lib/result';

// TODO(L5) — sendInvitation = authedAction('admin', schema, fn): token → sha256 →
// row + 'invitation.sent' audit in one withTenant tx → signed URL → email after
// commit; conflict on duplicate-pending + already-member.
//
// 'use server' (NOT server-only): the inspector's invite-form island imports
// sendInvitation and passes it to useActionState, so the module must create the
// server-action boundary.
export const sendInvitation = async (_prev: unknown, _formData: FormData) =>
  err('internal', 'Not implemented');
