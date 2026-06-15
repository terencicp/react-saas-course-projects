'use client';

// TODO(L3) — bind fields via atomic selectors + setters, inline errors

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Step1Page = () => (
  <div data-testid="step-1" className="space-y-4">
    <h2 className="text-lg font-medium">Contact</h2>
    <div className="space-y-2">
      <Label htmlFor="firstName">First name</Label>
      <Input id="firstName" data-testid="field-firstName" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="lastName">Last name</Label>
      <Input id="lastName" data-testid="field-lastName" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" data-testid="field-email" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="phone">Phone</Label>
      <Input id="phone" data-testid="field-phone" />
    </div>
  </div>
);

export default Step1Page;
