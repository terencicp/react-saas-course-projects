'use client';

// TODO(L3) — Back/Next reading selectIsStepValid, Next bundles goNext + router.push

import { Button } from '@/components/ui/button';

export const WizardFooter = () => (
  <div className="flex items-center justify-between gap-2 border-t pt-4">
    <span />
    <Button type="button" data-testid="wizard-next" disabled>
      Next
    </Button>
  </div>
);
