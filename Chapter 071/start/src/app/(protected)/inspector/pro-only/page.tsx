import { Suspense } from 'react';

import { Card } from '@/components/ui/card';
import { requirePlan } from '@/lib/billing';

// The gated body. requirePlan('pro') runs at the very top, before any read: it throws
// a BillingError when the active org lacks the `pro` tier, and the segment error.tsx
// catches it and renders the upgrade fallback. Exactly one of {fallback, gated
// content} renders — never both.
//
// At scaffold requirePlan is a stub that throws BillingError('plan_required'), so this
// route renders its error.tsx fallback deterministically against the seeded `free`
// org. The gate sits behind <Suspense> so the static shell prerenders and the
// request-time throw is caught by the boundary, not the build's prerender pass.
const GatedContent = async () => {
  await requirePlan('pro');

  return (
    <Card data-testid="pro-only-content" className="p-6">
      <h1 className="text-2xl font-semibold">Pro-only content</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You can see this because the active org has an active Pro (or higher)
        plan.
      </p>
    </Card>
  );
};

const ProOnlyPage = () => (
  <section className="mx-auto max-w-2xl px-6 py-16">
    <Suspense>
      <GatedContent />
    </Suspense>
  </section>
);

export default ProOnlyPage;
