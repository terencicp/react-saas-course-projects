'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { openPortal } from '@/lib/billing/portal';

type PortalButtonProps = {
  // Null until the org has a Stripe Customer (first Checkout). When null the button
  // is disabled with an explaining tooltip — there is no Portal to open yet.
  hasCustomer: boolean;
};

// The Billing Portal island. Calls billing.openPortal() and opens the returned URL in
// a new tab. Disabled with a tooltip when the org has no Stripe Customer (the
// belt-and-suspenders pair to openPortal's own no-customer guard).
export const PortalButton = ({ hasCustomer }: PortalButtonProps) => {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await openPortal(null, new FormData());
      if (result.ok) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      }
    });
  };

  if (hasCustomer) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        data-testid="portal-button"
      >
        Manage billing
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button does not fire pointer events, so the tooltip wraps a
              span that still receives hover. */}
          <span className="inline-block">
            <Button
              type="button"
              variant="outline"
              disabled
              data-testid="portal-button"
            >
              Manage billing
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          No Stripe Customer yet — start a Checkout to create one.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
