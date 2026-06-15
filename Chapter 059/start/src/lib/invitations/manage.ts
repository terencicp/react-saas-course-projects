'use server';

import { err } from '@/lib/result';

// TODO(L4) — changeMemberRole = authedAction('admin', schema, fn): refuse owner
// targets + last-owner; write the role change + logAudit in one withTenant tx.
//
// 'use server' (NOT server-only): the inspector's role-select island imports
// changeMemberRole and passes it to useActionState, so the module must create the
// server-action boundary. A server-only module breaks the client build the instant a
// client island imports it.
export const changeMemberRole = async (_prev: unknown, _formData: FormData) =>
  err('internal', 'Not implemented');
