'use client';

// TODO(L3) — bind fields via atomic selectors + setters, inline errors

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const Step3Page = () => (
  <div data-testid="step-3" className="space-y-4">
    <h2 className="text-lg font-medium">Preferences</h2>
    <div className="space-y-2">
      <Label htmlFor="defaultCurrency">Default currency</Label>
      <select
        id="defaultCurrency"
        data-testid="field-defaultCurrency"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        defaultValue="USD"
      >
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
      </select>
    </div>
    <div className="space-y-2">
      <Label htmlFor="language">Language</Label>
      <select
        id="language"
        data-testid="field-language"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        defaultValue="en-US"
      >
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="fr-FR">Français</option>
      </select>
    </div>
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Notification channels</legend>
      <div className="flex items-center gap-2">
        <Checkbox id="channel-email" data-testid="channel-email" />
        <Label htmlFor="channel-email">Email</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="channel-sms" data-testid="channel-sms" />
        <Label htmlFor="channel-sms">SMS</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="channel-inApp" data-testid="channel-inApp" />
        <Label htmlFor="channel-inApp">In-app</Label>
      </div>
    </fieldset>
  </div>
);

export default Step3Page;
