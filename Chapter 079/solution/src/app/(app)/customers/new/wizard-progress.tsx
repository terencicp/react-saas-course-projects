'use client';

import { useWizardStore } from '@/app/(app)/customers/new/_components/use-wizard-store';

// The progress header. Reads `currentStep` and `completedSteps` through two
// atomic selectors (primitive + array) so it re-renders only when those change.
// Renders "Step N of 4" plus four pips — the current step highlighted, the
// completed steps marked. Provided in full: it consumes the store, so it proves
// the store boots and the provider is mounted above it.
const TOTAL_STEPS = 4;

export const WizardProgress = () => {
  const currentStep = useWizardStore((s) => s.currentStep);
  const completedSteps = useWizardStore((s) => s.completedSteps);

  return (
    <div
      data-testid="wizard-progress"
      className="flex items-center justify-between gap-4"
    >
      <span className="text-sm font-medium">
        Step {currentStep} of {TOTAL_STEPS}
      </span>
      <ol className="flex items-center gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const step = i + 1;
          const isCurrent = step === currentStep;
          const isComplete = completedSteps.includes(step);
          return (
            <li
              key={step}
              data-testid={`wizard-pip-${step}`}
              data-current={isCurrent || undefined}
              data-complete={isComplete || undefined}
              className={
                isCurrent
                  ? 'size-2.5 rounded-full bg-primary'
                  : isComplete
                    ? 'size-2.5 rounded-full bg-primary/50'
                    : 'size-2.5 rounded-full bg-muted-foreground/30'
              }
            />
          );
        })}
      </ol>
    </div>
  );
};
