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
> = (set) => ({
  contact: { firstName: '', lastName: '', email: '', phone: '' },
  setContactField: (key, value) =>
    set((s) => ({ contact: { ...s.contact, [key]: value } })),
});
