import { z } from 'zod';
import {
  billingSchema,
  contactSchema,
  preferencesSchema,
} from '@/app/(app)/customers/new/_lib/wizard/schemas';
import type { WizardState } from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

export const selectCurrentStep = (s: WizardState) => s.currentStep;

export const selectContactFirstName = (s: WizardState) => s.contact.firstName;
export const selectContactLastName = (s: WizardState) => s.contact.lastName;
export const selectContactEmail = (s: WizardState) => s.contact.email;
export const selectContactPhone = (s: WizardState) => s.contact.phone;

type Step = { schema: z.ZodType; slice: (s: WizardState) => unknown };

const steps: readonly Step[] = [
  { schema: contactSchema, slice: (s) => s.contact },
  { schema: billingSchema, slice: (s) => s.billing },
  { schema: preferencesSchema, slice: (s) => s.preferences },
];

export const selectIsStepValid = (state: WizardState): boolean => {
  const step = steps[state.currentStep - 1];
  return step ? step.schema.safeParse(step.slice(state)).success : true;
};

export const selectStepErrors = (
  state: WizardState,
): Record<string, string[]> => {
  const step = steps[state.currentStep - 1];
  if (!step) {
    return {};
  }
  const result = step.schema.safeParse(step.slice(state));
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
};
