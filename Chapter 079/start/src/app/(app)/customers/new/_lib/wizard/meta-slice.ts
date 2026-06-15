// TODO(L2) — author this slice's StateCreator (data + setters)

import type { StateCreator } from 'zustand';
import type {
  MetaSlice,
  WizardStore,
} from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

export const createMetaSlice: StateCreator<
  WizardStore,
  [],
  [],
  MetaSlice
> = () => ({
  currentStep: 1,
  completedSteps: [],
  goNext: () => {},
  goBack: () => {},
});
