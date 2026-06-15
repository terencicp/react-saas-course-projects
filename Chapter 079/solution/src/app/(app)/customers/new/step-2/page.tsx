'use client';

import { useBroadcastRender } from '@/app/(app)/customers/new/_components/use-broadcast-render';
import { useWizardStore } from '@/app/(app)/customers/new/_components/use-wizard-store';
import { selectStepErrors } from '@/app/(app)/customers/new/_lib/wizard/selectors';
import type { BillingSlice } from '@/app/(app)/customers/new/_lib/wizard/wizard-types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Same per-field decomposition as step-1: each billing control is its own
// client component owning an atomic selector + setter (+ atomic error primitive
// where the field is validated), so a keystroke re-renders only that field.

const Line1Field = () => {
  const line1 = useWizardStore((s) => s.billing.line1);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  const error = useWizardStore((s) => selectStepErrors(s).line1?.[0]);
  useBroadcastRender('line1');

  return (
    <div className="space-y-2">
      <Label htmlFor="line1">Address line 1</Label>
      <Input
        id="line1"
        data-testid="field-line1"
        value={line1}
        onChange={(e) => setBillingField('line1', e.target.value)}
      />
      {error ? (
        <p data-testid="error-line1" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const Line2Field = () => {
  const line2 = useWizardStore((s) => s.billing.line2);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  useBroadcastRender('line2');

  return (
    <div className="space-y-2">
      <Label htmlFor="line2">Address line 2</Label>
      <Input
        id="line2"
        data-testid="field-line2"
        value={line2}
        onChange={(e) => setBillingField('line2', e.target.value)}
      />
    </div>
  );
};

const CityField = () => {
  const city = useWizardStore((s) => s.billing.city);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  const error = useWizardStore((s) => selectStepErrors(s).city?.[0]);
  useBroadcastRender('city');

  return (
    <div className="space-y-2">
      <Label htmlFor="city">City</Label>
      <Input
        id="city"
        data-testid="field-city"
        value={city}
        onChange={(e) => setBillingField('city', e.target.value)}
      />
      {error ? (
        <p data-testid="error-city" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const RegionField = () => {
  const region = useWizardStore((s) => s.billing.region);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  const error = useWizardStore((s) => selectStepErrors(s).region?.[0]);
  useBroadcastRender('region');

  return (
    <div className="space-y-2">
      <Label htmlFor="region">Region</Label>
      <Input
        id="region"
        data-testid="field-region"
        value={region}
        onChange={(e) => setBillingField('region', e.target.value)}
      />
      {error ? (
        <p data-testid="error-region" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const PostalCodeField = () => {
  const postalCode = useWizardStore((s) => s.billing.postalCode);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  const error = useWizardStore((s) => selectStepErrors(s).postalCode?.[0]);
  useBroadcastRender('postalCode');

  return (
    <div className="space-y-2">
      <Label htmlFor="postalCode">Postal code</Label>
      <Input
        id="postalCode"
        data-testid="field-postalCode"
        value={postalCode}
        onChange={(e) => setBillingField('postalCode', e.target.value)}
      />
      {error ? (
        <p data-testid="error-postalCode" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const CountryField = () => {
  const country = useWizardStore((s) => s.billing.country);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  const error = useWizardStore((s) => selectStepErrors(s).country?.[0]);
  useBroadcastRender('country');

  return (
    <div className="space-y-2">
      <Label htmlFor="country">Country (2-letter)</Label>
      <Input
        id="country"
        maxLength={2}
        data-testid="field-country"
        value={country}
        onChange={(e) => setBillingField('country', e.target.value)}
      />
      {error ? (
        <p data-testid="error-country" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const TaxIdField = () => {
  const taxId = useWizardStore((s) => s.billing.taxId);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  const error = useWizardStore((s) => selectStepErrors(s).taxId?.[0]);
  useBroadcastRender('taxId');

  return (
    <div className="space-y-2">
      <Label htmlFor="taxId">Tax ID</Label>
      <Input
        id="taxId"
        data-testid="field-taxId"
        value={taxId}
        onChange={(e) => setBillingField('taxId', e.target.value)}
      />
      {error ? (
        <p data-testid="error-taxId" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const PaymentTermsField = () => {
  const paymentTerms = useWizardStore((s) => s.billing.paymentTerms);
  const setBillingField = useWizardStore((s) => s.setBillingField);
  useBroadcastRender('paymentTerms');

  return (
    <div className="space-y-2">
      <Label htmlFor="paymentTerms">Payment terms</Label>
      <select
        id="paymentTerms"
        data-testid="field-paymentTerms"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        value={paymentTerms}
        onChange={(e) =>
          setBillingField(
            'paymentTerms',
            e.target.value as BillingSlice['billing']['paymentTerms'],
          )
        }
      >
        <option value="net15">Net 15</option>
        <option value="net30">Net 30</option>
        <option value="net60">Net 60</option>
      </select>
    </div>
  );
};

const Step2Page = () => (
  <div data-testid="step-2" className="space-y-4">
    <h2 className="text-lg font-medium">Billing</h2>
    <Line1Field />
    <Line2Field />
    <CityField />
    <RegionField />
    <PostalCodeField />
    <CountryField />
    <TaxIdField />
    <PaymentTermsField />
  </div>
);

export default Step2Page;
