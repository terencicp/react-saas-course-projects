import type { StateCreator } from 'zustand';
import type {
  MetaSlice,
  WizardStore,
} from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

export const createMetaSlice: StateCreator<WizardStore, [], [], MetaSlice> = (
  set,
) => ({
  currentStep: 1,
  completedSteps: [],
  goNext: () =>
    set((s) => ({
      currentStep: s.currentStep + 1,
      completedSteps: s.completedSteps.includes(s.currentStep)
        ? s.completedSteps
        : [...s.completedSteps, s.currentStep],
    })),
  goBack: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
});
