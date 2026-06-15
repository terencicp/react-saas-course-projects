// TODO(L3) — steps array + selectIsStepValid + selectStepErrors

import type { WizardState } from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

export const selectCurrentStep = (s: WizardState) => s.currentStep;

export const selectIsStepValid = (_: WizardState) => false;

export const selectStepErrors = (
  _: WizardState,
): Record<string, string[]> => ({});
