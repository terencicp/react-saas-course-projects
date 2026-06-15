import { beforeEach, describe, expect, it } from 'vitest';
import { createWizardStore } from '@/app/(app)/customers/new/_lib/wizard/store';

// Pure vanilla-Zustand store: no React render. A fresh handle per test isolates
// every assertion. We exercise the slice setters and meta actions, then read
// `store.getState()` — the only observable the student's slice bodies produce.
type Store = ReturnType<typeof createWizardStore>;

let store: Store;

beforeEach(() => {
  store = createWizardStore();
});

describe('Requirement 1 — setContactField merges one contact field', () => {
  it('updates only the targeted field and leaves the other contact fields untouched', () => {
    store.getState().setContactField('firstName', 'Ada');

    const { contact } = store.getState();

    expect(
      contact.firstName,
      'setContactField did not write the new value onto state. The setter must call set((s) => ({ contact: { ...s.contact, [key]: value } })) — a no-op body leaves the field at its initial empty string.',
    ).toBe('Ada');

    expect(
      {
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
      },
      'setContactField clobbered the sibling contact fields. The merge must spread the existing contact object (...s.contact) before overwriting the single key, so the other three fields keep their initial values.',
    ).toEqual({ lastName: '', email: '', phone: '' });
  });
});

describe('Requirement 2 — setBillingField merges one billing field, including the enum', () => {
  it('writes a plain field without disturbing the others', () => {
    store.getState().setBillingField('city', 'Lisbon');

    const { billing } = store.getState();

    expect(
      billing.city,
      'setBillingField did not write the value. The setter must spread-merge one key onto billing, like setContactField does for contact.',
    ).toBe('Lisbon');

    expect(
      billing.line1,
      'setBillingField overwrote a sibling field. Spread ...s.billing before assigning [key]: value so the rest of the address is preserved.',
    ).toBe('');
  });

  it('accepts the paymentTerms enum value', () => {
    store.getState().setBillingField('paymentTerms', 'net60');

    expect(
      store.getState().billing.paymentTerms,
      'setBillingField did not update paymentTerms. The same merge handles the enum field — there is no special-casing; it should land net60 over the initial net30.',
    ).toBe('net60');
  });
});

describe('Requirement 3 — setPreferenceField merges one preference field, leaving channels intact', () => {
  it('updates currency without touching channels', () => {
    // Seed a channel first so we can prove the field setter leaves it in place.
    store.getState().togglePreferenceChannel('email');
    store.getState().setPreferenceField('defaultCurrency', 'EUR');

    const { preferences } = store.getState();

    expect(
      preferences.defaultCurrency,
      'setPreferenceField did not update defaultCurrency. It must spread-merge one key onto preferences, mirroring the contact/billing setters.',
    ).toBe('EUR');

    expect(
      preferences.channels,
      'setPreferenceField wiped the channels array. The merge must spread ...s.preferences so the channels list survives a currency/language write — channels is only ever changed by togglePreferenceChannel.',
    ).toEqual(['email']);
  });

  it('updates the language field', () => {
    store.getState().setPreferenceField('language', 'fr-FR');

    expect(
      store.getState().preferences.language,
      'setPreferenceField did not update language. The same one-key merge serves both currency and language.',
    ).toBe('fr-FR');
  });
});

describe('Requirement 4 — togglePreferenceChannel adds when absent, removes when present', () => {
  it('adds a channel that is not yet present', () => {
    store.getState().togglePreferenceChannel('sms');

    expect(
      store.getState().preferences.channels,
      'togglePreferenceChannel did not add the absent channel. When the channel is not in the array, the setter must append it.',
    ).toEqual(['sms']);
  });

  it('removes a channel that is already present', () => {
    store.getState().togglePreferenceChannel('sms');
    store.getState().togglePreferenceChannel('sms');

    expect(
      store.getState().preferences.channels,
      'Toggling the same channel twice did not return to empty. When the channel is already present, the setter must filter it out — toggle is add/remove, not add-only.',
    ).toEqual([]);
  });

  it('leaves the other channels in place when toggling one', () => {
    store.getState().togglePreferenceChannel('email');
    store.getState().togglePreferenceChannel('inApp');
    store.getState().togglePreferenceChannel('email');

    expect(
      store.getState().preferences.channels,
      'Removing one channel disturbed the others. The filter must drop only the toggled channel and keep the rest of the membership intact.',
    ).toEqual(['inApp']);
  });
});

describe('Requirement 5 — goNext advances the step and records the step just left, de-duped', () => {
  it('moves currentStep forward by one and appends the left step', () => {
    store.getState().goNext();

    const { currentStep, completedSteps } = store.getState();

    expect(
      currentStep,
      'goNext did not advance currentStep. It must set currentStep to s.currentStep + 1.',
    ).toBe(2);

    expect(
      completedSteps,
      'goNext did not record the step it left. Advancing from step 1 should append 1 to completedSteps.',
    ).toEqual([1]);
  });

  it('does not duplicate an already-recorded step', () => {
    store.getState().goNext(); // 1 -> 2, completedSteps [1]
    store.getState().goBack(); // 2 -> 1, completedSteps [1]
    store.getState().goNext(); // 1 -> 2 again, completedSteps still [1]

    expect(
      store.getState().completedSteps,
      'goNext duplicated a step already in completedSteps. The append must be guarded — only push the current step if completedSteps does not already include it.',
    ).toEqual([1]);
  });
});

describe('Requirement 6 — goBack moves back by one but never below 1', () => {
  it('decrements currentStep when above 1', () => {
    store.getState().goNext(); // 1 -> 2
    store.getState().goBack(); // 2 -> 1

    expect(
      store.getState().currentStep,
      'goBack did not decrement currentStep. From step 2 it should land on step 1.',
    ).toBe(1);
  });

  it('clamps at 1 and does not go below', () => {
    store.getState().goBack(); // already at 1

    expect(
      store.getState().currentStep,
      'goBack dropped currentStep below 1. The decrement must be clamped with Math.max(1, s.currentStep - 1) so step 1 is the floor.',
    ).toBe(1);
  });
});

describe('Requirement 7 — reset returns the store to its initial values, actions still callable', () => {
  it('restores every slice and the meta fields after mutation', () => {
    const s = store.getState();
    s.setContactField('firstName', 'Ada');
    s.setBillingField('city', 'Lisbon');
    s.setPreferenceField('defaultCurrency', 'EUR');
    s.togglePreferenceChannel('email');
    s.goNext();
    s.goNext();

    store.getState().reset();

    const after = store.getState();

    expect(
      after.contact,
      'reset did not clear the contact slice. A no-op reset leaves the dirty draft; the working reset overlays initialWizardData so contact returns to all-empty.',
    ).toEqual({ firstName: '', lastName: '', email: '', phone: '' });

    expect(
      after.billing.city,
      'reset did not clear the billing slice. The replace-mode write must restore billing to its initial values.',
    ).toBe('');

    expect(
      after.preferences,
      'reset did not clear the preferences slice. defaultCurrency should be back to USD and channels back to empty.',
    ).toEqual({ channels: [], defaultCurrency: 'USD', language: 'en-US' });

    expect(
      after.currentStep,
      'reset did not return currentStep to 1. The meta fields are part of initialWizardData and must reset alongside the data slices.',
    ).toBe(1);

    expect(
      after.completedSteps,
      'reset did not empty completedSteps. The progress trail must clear on reset.',
    ).toEqual([]);
  });

  it('leaves the setters and actions callable after reset', () => {
    store.getState().goNext();
    store.getState().reset();

    // The reset re-spreads the slice factories in replace mode, so fresh action
    // identities survive. A partial set() that dropped them would make this throw.
    store.getState().setContactField('firstName', 'Grace');
    store.getState().goNext();

    expect(
      store.getState().contact.firstName,
      'A setter stopped working after reset. reset must write a COMPLETE store (the composeSlices spread overlaid with initialWizardData, in replace mode) — a partial set that drops the action functions leaves the store half-built.',
    ).toBe('Grace');

    expect(
      store.getState().currentStep,
      'A meta action stopped working after reset. The replace-mode reset must carry fresh goNext/goBack identities so navigation keeps working post-reset.',
    ).toBe(2);
  });
});
