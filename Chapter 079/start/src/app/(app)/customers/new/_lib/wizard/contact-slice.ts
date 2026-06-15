// TODO(L2) — author this slice's StateCreator (data + setters)

import type { StateCreator } from 'zustand';
import type {
  ContactSlice,
  WizardStore,
} from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

export const createContactSlice: StateCreator<
  WizardStore,
  [],
  [],
  ContactSlice
> = () => ({
  contact: { firstName: '', lastName: '', email: '', phone: '' },
  setContactField: () => {},
});
