import 'server-only';

import { requireOrgUser } from '@/lib/auth';
import { BillingError } from '@/lib/billing/billing-error';

// The load-bearing Server-Component gate. `import 'server-only'` (NOT 'use server') —
// it is called from server components, never client-callable. A failure throws a
// BillingError, which the segment error.tsx catches and renders as the upgrade
// fallback; the gate is fail-closed. At scaffold it always throws so /inspector/pro-only
// renders its gate fallback deterministically.
//
// requireOrgUser() runs first (as it will in L5): it reads request-time headers, which
// keeps the calling page dynamic so the throw lands at request time and the segment
// error.tsx catches it — never the build's static prerender pass.
//
// TODO(L5) — requirePlan: requireOrgUser → getEntitlement → throw no_access (inactive)
// / plan_required (too-low tier via PLAN_RANK).
export const requirePlan = async (_planSlug: 'pro' | 'team'): Promise<void> => {
  await requireOrgUser();
  throw new BillingError('plan_required', 'Upgrade to continue.');
};
