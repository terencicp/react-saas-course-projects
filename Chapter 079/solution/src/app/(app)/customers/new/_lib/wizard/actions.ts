'use server';

import { revalidatePath } from 'next/cache';
import { createCustomerInput } from '@/app/(app)/customers/new/_lib/wizard/schemas';
import { logAudit } from '@/lib/audit-log';
import { authedInputAction } from '@/lib/authed-action';
import { consumeForceFailure } from '@/lib/force-failure';
import { conflict, err, ok } from '@/lib/result';
import { pushCustomer } from '@/server/store';
import type { Customer } from '@/server/types';

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: unknown }).code === '23505';

const FORCE_FAILURE_DELAY_MS = 200;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// The only client↔server seam. The submit button calls this with the composite
// draft it holds parsed in the client store; `authedInputAction` re-parses
// `createCustomerInput` at the boundary (correctness, not UX — the Next-gate is
// the UX half). On the happy path it writes the customer row and a
// `customer.created` audit row, then revalidates the list. A thrown
// `{ code: '23505' }` from `pushCustomer` (the duplicate-email seed reuses
// `dupe@acme.test`) maps to a `conflict`; other throws rethrow into
// `authedInputAction`'s `internal` default.
export const createCustomer = authedInputAction(
  'member',
  createCustomerInput,
  async (input, ctx) => {
    if (consumeForceFailure(ctx.userId)) {
      await delay(FORCE_FAILURE_DELAY_MS);
      return err('internal', 'Forced action failure for verification');
    }

    let row: Customer;
    try {
      row = pushCustomer({
        orgId: ctx.orgId,
        firstName: input.contact.firstName,
        lastName: input.contact.lastName,
        email: input.contact.email,
        phone: input.contact.phone,
        ...input.billing,
        defaultCurrency: input.preferences.defaultCurrency,
        language: input.preferences.language,
        notificationChannels: input.preferences.channels,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return conflict(
          'A customer with this email already exists in this organization.',
          null,
        );
      }
      throw error;
    }

    logAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'customer.created',
      subjectId: row.id,
    });
    revalidatePath('/customers');
    return ok({ id: row.id });
  },
);
