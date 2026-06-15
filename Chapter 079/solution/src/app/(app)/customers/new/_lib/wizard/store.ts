import type { StateCreator } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createBillingSlice } from '@/app/(app)/customers/new/_lib/wizard/billing-slice';
import { createContactSlice } from '@/app/(app)/customers/new/_lib/wizard/contact-slice';
import { createMetaSlice } from '@/app/(app)/customers/new/_lib/wizard/meta-slice';
import { createPreferencesSlice } from '@/app/(app)/customers/new/_lib/wizard/preferences-slice';
import {
  initialWizardData,
  type WizardStore,
} from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

const composeSlices: StateCreator<WizardStore, [], [], WizardStore> = (
  ...a
) => ({
  ...createContactSlice(...a),
  ...createBillingSlice(...a),
  ...createPreferencesSlice(...a),
  ...createMetaSlice(...a),
  reset: () => a[0]({ ...composeSlices(...a), ...initialWizardData }, true),
});

export const createWizardStore = () =>
  createStore<WizardStore>()(composeSlices);

export type WizardStoreApi = ReturnType<typeof createWizardStore>;
