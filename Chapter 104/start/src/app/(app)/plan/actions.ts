'use server';

import { updateTag } from 'next/cache';
import { orgPlanEntitlementTag } from '@/lib/cache/tags';
import { err, ok, type Result } from '@/lib/result';
import { getSession } from '@/server/session';
import { findOrganization } from '@/server/store';
import type { Organization } from '@/server/types';

// The plan-label mutation. It rolls its own session check by hand, reaches past
// the tenant facade to mutate the org record directly, runs no role check and no
// rate limit, and records nothing to the compliance trail. It compiles, runs, and
// rewrites the label against the in-memory store — working but wrong. The proposed
// fixes live in the review, never in this file.
export const updatePlanLabel = async (
  formData: FormData,
): Promise<Result<Organization>> => {
  const session = await getSession();
  if (!session) {
    throw new Error('Not signed in');
  }

  const planLabel = String(formData.get('planLabel') ?? '');
  if (planLabel.length === 0) {
    return err('validation', 'Plan label is required.');
  }

  const org = findOrganization(session.orgId);
  if (!org) {
    return err('not_found', 'Organization not found.');
  }

  org.planLabel = planLabel;

  updateTag(orgPlanEntitlementTag(session.orgId));
  return ok(org);
};
