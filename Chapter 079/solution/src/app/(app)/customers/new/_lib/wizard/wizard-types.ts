// The wizard's type surface. Each slice owns its data + setters; validity is
// derived in `selectors.ts`, never stored here. `WizardState` is the four-slice
// intersection (data + per-slice actions); `WizardStore` adds the store-level
// `reset`. `completedSteps` is a `number[]` (never a `Set`) so the snapshot
// serializes for the inspector bridge.

export type ContactSlice = {
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  setContactField: <K extends keyof ContactSlice['contact']>(
    key: K,
    value: ContactSlice['contact'][K],
  ) => void;
};

export type BillingSlice = {
  billing: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    taxId: string;
    paymentTerms: 'net15' | 'net30' | 'net60';
  };
  setBillingField: <K extends keyof BillingSlice['billing']>(
    key: K,
    value: BillingSlice['billing'][K],
  ) => void;
};

export type PreferencesSlice = {
  preferences: {
    channels: Array<'email' | 'sms' | 'inApp'>;
    defaultCurrency: string;
    language: 'en-US' | 'en-GB' | 'fr-FR';
  };
  setPreferenceField: <
    K extends keyof Omit<PreferencesSlice['preferences'], 'channels'>,
  >(
    key: K,
    value: PreferencesSlice['preferences'][K],
  ) => void;
  togglePreferenceChannel: (channel: 'email' | 'sms' | 'inApp') => void;
};

export type MetaSlice = {
  currentStep: number;
  completedSteps: number[];
  goNext: () => void;
  goBack: () => void;
};

export type WizardState = ContactSlice &
  BillingSlice &
  PreferencesSlice &
  MetaSlice;

export type WizardStore = WizardState & { reset: () => void };

// The data-only projection of every slice. `reset` overlays this onto a fresh
// spread of the slice factories so the replace-flag write produces a complete
// store (blank data + fresh action identities).
export const initialWizardData: Pick<
  WizardState,
  'contact' | 'billing' | 'preferences' | 'currentStep' | 'completedSteps'
> = {
  contact: { firstName: '', lastName: '', email: '', phone: '' },
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
  preferences: { channels: [], defaultCurrency: 'USD', language: 'en-US' },
  currentStep: 1,
  completedSteps: [],
};
