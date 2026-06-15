'use server';

// TODO(L4) — createCustomer (authedInputAction + composite Zod re-parse + pushCustomer + logAudit + 23505→conflict)

import { createCustomerInput } from '@/app/(app)/customers/new/_lib/wizard/schemas';
import { authedInputAction } from '@/lib/authed-action';
import { err } from '@/lib/result';

export const createCustomer = authedInputAction(
  'member',
  createCustomerInput,
  async () => err('internal', 'Not implemented'),
);
