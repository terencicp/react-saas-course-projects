import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { orgPlanEntitlementTag } from '@/lib/cache/tags';
import { findPlanEntitlement } from '@/server/store';
import type { PlanEntitlement } from '@/server/types';

export const getPlanEntitlement = async (
  orgId: string,
): Promise<(PlanEntitlement & { fetchedAt: string }) | null> => {
  'use cache';
  cacheLife('minutes');
  cacheTag(orgPlanEntitlementTag(orgId));
  const row = findPlanEntitlement(orgId);
  if (!row) {
    return null;
  }
  return { ...row, fetchedAt: new Date().toISOString() };
};
