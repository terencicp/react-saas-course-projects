'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useBroadcastRender } from '@/app/(app)/customers/new/_components/use-broadcast-render';
import { useWizardStore } from '@/app/(app)/customers/new/_components/use-wizard-store';
import {
  selectCurrentStep,
  selectIsStepValid,
} from '@/app/(app)/customers/new/_lib/wizard/selectors';
import { Button } from '@/components/ui/button';

const TOTAL_STEPS = 4;

export const WizardFooter = () => {
  const currentStep = useWizardStore(selectCurrentStep);
  const isValid = useWizardStore(selectIsStepValid);
  const goNext = useWizardStore((s) => s.goNext);
  const goBack = useWizardStore((s) => s.goBack);
  const router = useRouter();

  // Report the footer's renders so the inspector's re-render-counter panel can
  // show it re-renders at most once per keystroke burst — only when the
  // Next-gate boolean (`isValid`) flips, not on every character typed.
  useBroadcastRender('footer');

  const onBack = () => {
    goBack();
    router.push(`/customers/new/step-${currentStep - 1}` as Route);
  };

  const onNext = () => {
    goNext();
    router.push(`/customers/new/step-${currentStep + 1}` as Route);
  };

  return (
    <div className="flex items-center justify-between gap-2 border-t pt-4">
      {currentStep > 1 ? (
        <Button
          type="button"
          variant="outline"
          data-testid="wizard-back"
          onClick={onBack}
        >
          Back
        </Button>
      ) : (
        <span />
      )}
      {currentStep < TOTAL_STEPS ? (
        <Button
          type="button"
          data-testid="wizard-next"
          disabled={!isValid}
          onClick={onNext}
        >
          Next
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
};
