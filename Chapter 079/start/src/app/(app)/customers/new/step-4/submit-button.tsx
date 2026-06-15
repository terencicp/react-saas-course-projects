'use client';

// TODO(L4) — useTransition guard, call action, reset, router.push

import { Button } from '@/components/ui/button';

export const SubmitButton = () => (
  <div className="space-y-2">
    <Button type="button" data-testid="wizard-submit" disabled>
      Create customer
    </Button>
  </div>
);
