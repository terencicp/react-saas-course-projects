'use client';

// TODO(L3) — bind fields via atomic selectors + setters, inline errors

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Step2Page = () => (
  <div data-testid="step-2" className="space-y-4">
    <h2 className="text-lg font-medium">Billing</h2>
    <div className="space-y-2">
      <Label htmlFor="line1">Address line 1</Label>
      <Input id="line1" data-testid="field-line1" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="line2">Address line 2</Label>
      <Input id="line2" data-testid="field-line2" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="city">City</Label>
      <Input id="city" data-testid="field-city" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="region">Region</Label>
      <Input id="region" data-testid="field-region" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="postalCode">Postal code</Label>
      <Input id="postalCode" data-testid="field-postalCode" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="country">Country (2-letter)</Label>
      <Input id="country" maxLength={2} data-testid="field-country" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="taxId">Tax ID</Label>
      <Input id="taxId" data-testid="field-taxId" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="paymentTerms">Payment terms</Label>
      <select
        id="paymentTerms"
        data-testid="field-paymentTerms"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        defaultValue="net30"
      >
        <option value="net15">Net 15</option>
        <option value="net30">Net 30</option>
        <option value="net60">Net 60</option>
      </select>
    </div>
  </div>
);

export default Step2Page;
