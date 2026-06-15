// TODO(L2) — author this slice's StateCreator (data + setters)

import type { StateCreator } from 'zustand';
import type {
  PreferencesSlice,
  WizardStore,
} from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

export const createPreferencesSlice: StateCreator<
  WizardStore,
  [],
  [],
  PreferencesSlice
> = () => ({
  preferences: { channels: [], defaultCurrency: 'USD', language: 'en-US' },
  setPreferenceField: () => {},
  togglePreferenceChannel: () => {},
});
