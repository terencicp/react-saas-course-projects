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
> = (set) => ({
  preferences: { channels: [], defaultCurrency: 'USD', language: 'en-US' },
  setPreferenceField: (key, value) =>
    set((s) => ({ preferences: { ...s.preferences, [key]: value } })),
  togglePreferenceChannel: (channel) =>
    set((s) => ({
      preferences: {
        ...s.preferences,
        channels: s.preferences.channels.includes(channel)
          ? s.preferences.channels.filter((c) => c !== channel)
          : [...s.preferences.channels, channel],
      },
    })),
});
