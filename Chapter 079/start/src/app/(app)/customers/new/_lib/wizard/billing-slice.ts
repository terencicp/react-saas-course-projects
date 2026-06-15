// TODO(L2) — author this slice's StateCreator (data + setters)

import type { StateCreator } from 'zustand';
import type {
  BillingSlice,
  WizardStore,
} from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

export const createBillingSlice: StateCreator<
  WizardStore,
  [],
  [],
  BillingSlice
> = () => ({
  billing: {
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
    taxId: '',
    paymentTerms: 'net30',
  },
  setBillingField: () => {},
});
