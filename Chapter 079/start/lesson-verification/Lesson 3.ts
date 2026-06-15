import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectIsStepValid,
  selectStepErrors,
} from '@/app/(app)/customers/new/_lib/wizard/selectors';
import { createWizardStore } from '@/app/(app)/customers/new/_lib/wizard/store';

// Pure selector logic driven against a real vanilla-Zustand handle: no React
// render. The store's slice setters fill each step's slice, and the selectors
// derive validity + field errors by running the per-step Zod schema over the
// current slice. The only observable is what `selectIsStepValid` /
// `selectStepErrors` return for `store.getState()` at a given `currentStep`.
type Store = ReturnType<typeof createWizardStore>;

let store: Store;

beforeEach(() => {
  store = createWizardStore();
});

// L2's setters are live in both start and solution, so these helpers fill a
// step's slice with values its schema accepts. Validity is *derived* from the
// slice — these never touch validity directly.
const fillContact = () => {
  const s = store.getState();
  s.setContactField('firstName', 'Ada');
  s.setContactField('lastName', 'Lovelace');
  s.setContactField('email', 'ada@example.com');
  s.setContactField('phone', '5550123');
};

const fillBilling = () => {
  const s = store.getState();
  s.setBillingField('line1', '1 Analytical Way');
  s.setBillingField('city', 'London');
  s.setBillingField('region', 'Greater London');
  s.setBillingField('postalCode', 'EC1A 1BB');
  s.setBillingField('country', 'GB');
  s.setBillingField('taxId', 'GB123456789');
  s.setBillingField('paymentTerms', 'net30');
};

const fillPreferences = () => {
  const s = store.getState();
  s.togglePreferenceChannel('email');
  s.setPreferenceField('defaultCurrency', 'EUR');
  s.setPreferenceField('language', 'en-GB');
};

// Position the selector under test by writing `currentStep` through the vanilla
// store's public `setState` — independent of the student's `goNext`, which the
// selectors do not own. `selectIsStepValid` keys off `currentStep`, so this is
// all the selectors need to pick the right step's schema.
const goToStep = (target: number) => {
  store.setState({ currentStep: target });
};

describe('Requirement 1 — per-step validity is derived from the step schema over its slice', () => {
  it('reports step 1 (contact) invalid while the slice is empty', () => {
    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid returned true for an empty contact slice. On step 1 it must run contactSchema.safeParse over s.contact — a blank firstName/lastName/email/phone must fail, so the gate stays closed.',
    ).toBe(false);
  });

  it('reports step 1 valid once every contact field parses', () => {
    fillContact();

    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid stayed false after every contact field was filled with valid data. It must return contactSchema.safeParse(s.contact).success, which is true here — not a hardcoded false.',
    ).toBe(true);
  });

  it('reports step 1 invalid when a single field is malformed', () => {
    fillContact();
    store.getState().setContactField('email', 'not-an-email');

    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid stayed true with a malformed email. One failing field must close the gate — the whole slice has to parse, not just be non-empty.',
    ).toBe(false);
  });

  it('reports step 2 (billing) invalid empty, valid once filled', () => {
    goToStep(2);

    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid did not gate the billing step. On step 2 it must index the billing entry of the steps array and run billingSchema over s.billing — an empty address must fail.',
    ).toBe(false);

    fillBilling();

    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid stayed false after the billing slice was filled validly. The steps array must pair billingSchema with s.billing so step 2 derives its own validity.',
    ).toBe(true);
  });

  it('reports step 3 (preferences) invalid with no channel, valid once a channel is chosen', () => {
    goToStep(3);
    store.getState().setPreferenceField('defaultCurrency', 'EUR');
    store.getState().setPreferenceField('language', 'en-GB');

    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid reported step 3 valid with an empty channels array. preferencesSchema requires at least one channel — the gate must reflect that.',
    ).toBe(false);

    fillPreferences();

    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid stayed false after a channel, currency, and language were set. The preferences entry of the steps array must run preferencesSchema over s.preferences.',
    ).toBe(true);
  });
});

describe('Requirement 2 — field errors surface per-field through the flattened error map', () => {
  it('returns no errors when the current slice parses', () => {
    fillContact();

    expect(
      selectStepErrors(store.getState()),
      'selectStepErrors returned errors for a fully valid contact slice. On a successful parse it must return {} — errors are derived from a failed safeParse only.',
    ).toEqual({});
  });

  it('keys the error map by field name with a message array', () => {
    fillContact();
    store.getState().setContactField('email', 'not-an-email');

    const errors = selectStepErrors(store.getState());

    expect(
      Array.isArray(errors.email),
      'selectStepErrors did not surface the email error under an `email` key holding a string[]. It must return z.flattenError(result.error).fieldErrors so each field maps to its own message array.',
    ).toBe(true);

    expect(
      (errors.email ?? []).length,
      'The email field error array was empty. A malformed email must produce at least one message under fieldErrors.email.',
    ).toBeGreaterThan(0);
  });

  it('only the failing field appears in the map', () => {
    fillContact();
    store.getState().setContactField('firstName', '');

    const errors = selectStepErrors(store.getState());

    expect(
      Array.isArray(errors.firstName),
      'An empty firstName did not surface under fieldErrors.firstName. The flattened map keys every failing field by name.',
    ).toBe(true);

    expect(
      errors.email,
      'A still-valid email field showed up in the error map. flattenError only lists fields that failed — valid fields must be absent.',
    ).toBeUndefined();
  });
});

describe('Requirement 3 — the review step (step 4) is not gated', () => {
  it('reports valid on step 4 with empty slices because there is no step-4 schema', () => {
    goToStep(4);

    expect(
      selectIsStepValid(store.getState()),
      'selectIsStepValid returned false on step 4. The steps array has no step-4 entry, so the lookup is undefined and the selector must fall back to true — the review screen is never gated.',
    ).toBe(true);
  });

  it('returns an empty error map on step 4', () => {
    goToStep(4);

    expect(
      selectStepErrors(store.getState()),
      'selectStepErrors returned errors on step 4. With no step-4 schema there is nothing to parse, so it must return {}.',
    ).toEqual({});
  });
});
