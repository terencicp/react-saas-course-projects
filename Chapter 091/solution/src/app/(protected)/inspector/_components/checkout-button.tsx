'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { upgrade } from '@/lib/billing/upgrade';

type CheckoutButtonProps = {
  plan: 'pro' | 'team';
  testId: string;
};

// The Checkout island. Calls billing.upgrade(plan) and, on ok, navigates the browser
// to the returned hosted Checkout URL (a full navigation, not a router.push — the URL
// is on Stripe's domain). Until upgrade is implemented (S4) the action returns an
// error Result; the button surfaces it inline.
export const CheckoutButton = ({ plan, testId }: CheckoutButtonProps) => {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const form = new FormData();
      form.set('planSlug', plan);
      const result = await upgrade(null, form);
      if (result.ok) {
        window.location.assign(result.data.url);
      }
    });
  };

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-testid={testId}
    >
      {plan === 'pro' ? 'Upgrade to Pro' : 'Upgrade to Team'}
    </Button>
  );
};
