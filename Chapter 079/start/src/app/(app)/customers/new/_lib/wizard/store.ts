// TODO(L2) — compose the four slices via vanilla createStore + store-wide reset

import type { StateCreator } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { createBillingSlice } from '@/app/(app)/customers/new/_lib/wizard/billing-slice';
import { createContactSlice } from '@/app/(app)/customers/new/_lib/wizard/contact-slice';
import { createMetaSlice } from '@/app/(app)/customers/new/_lib/wizard/meta-slice';
import { createPreferencesSlice } from '@/app/(app)/customers/new/_lib/wizard/preferences-slice';
import type { WizardStore } from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

const composeSlices: StateCreator<WizardStore, [], [], WizardStore> = (
  ...a
) => ({
  ...createContactSlice(...a),
  ...createBillingSlice(...a),
  ...createPreferencesSlice(...a),
  ...createMetaSlice(...a),
  reset: () => {},
});

export const createWizardStore = () =>
  createStore<WizardStore>()(composeSlices);

export type WizardStoreApi = ReturnType<typeof createWizardStore>;
