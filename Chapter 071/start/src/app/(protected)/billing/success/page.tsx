import { Suspense } from 'react';

import { Poller } from '@/app/(protected)/billing/success/Poller';
import { getInspectorContext } from '@/app/(protected)/inspector/_data';
import { Card } from '@/components/ui/card';

// The Checkout return surface. Checkout redirects here with ?session_id=…, but this
// page NEVER calls sessions.retrieve and never writes the entitlement — the webhook
// is the only writer. It reads the current entitlement and, while it is still `free`
// (the webhook may not have landed yet), the Poller refreshes the route until the
// projected plan appears. Trusting session_id to grant access is the named
// anti-pattern; this is the read-and-poll pattern instead.

const SuccessBody = async () => {
  const { entitlement } = await getInspectorContext();
  const finalizing = entitlement.plan === 'free';

  return (
    <Card data-testid="billing-success" className="p-6">
      <h1 className="text-2xl font-semibold">
        {finalizing ? 'Finalizing your subscription…' : 'You are all set'}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {finalizing
          ? 'We are confirming your payment with Stripe. This page updates automatically.'
          : `Your plan is now ${entitlement.plan}.`}
      </p>
      <Poller finalizing={finalizing} />
    </Card>
  );
};

const SuccessPage = () => (
  <section className="mx-auto max-w-2xl px-6 py-16">
    <Suspense>
      <SuccessBody />
    </Suspense>
  </section>
);

export default SuccessPage;
