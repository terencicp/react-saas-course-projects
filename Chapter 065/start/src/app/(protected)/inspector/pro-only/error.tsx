'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// The segment error boundary for /inspector/pro-only. requirePlan throws a
// BillingError when the gate fails; this fallback catches it and renders the upgrade
// prompt. It switches on the error's `code` to choose the message — 'plan_required'
// (the tier is too low) vs 'no_access' (the subscription is inactive).
//
// error.tsx must be a Client Component. The thrown BillingError arrives as a plain
// Error here (its prototype is lost across the boundary), so the code is read off the
// serialized shape rather than `instanceof`. The discrimination is on BillingError.code:
// 'no_access' (the subscription is inactive) vs 'plan_required' (the tier is too low) —
// the two refusals requirePlan throws against this gate.
type BillingErrorLike = Error & { code?: string };

const ProOnlyGate = ({
  error,
}: {
  error: BillingErrorLike;
  reset: () => void;
}) => {
  const code = error.code ?? 'plan_required';
  const message =
    code === 'no_access'
      ? 'Your subscription is no longer active. Reactivate to regain access.'
      : 'This area requires the Pro plan. Upgrade to continue.';

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <Card data-testid="pro-only-gate" className="p-6">
        <h1 className="text-2xl font-semibold">Upgrade to Pro</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button asChild className="mt-4">
          <Link href="/inspector">Back to the inspector</Link>
        </Button>
      </Card>
    </section>
  );
};

export default ProOnlyGate;
