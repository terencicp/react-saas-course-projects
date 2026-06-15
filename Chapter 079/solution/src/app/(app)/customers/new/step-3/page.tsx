'use client';

import { useBroadcastRender } from '@/app/(app)/customers/new/_components/use-broadcast-render';
import { useWizardStore } from '@/app/(app)/customers/new/_components/use-wizard-store';
import type { PreferencesSlice } from '@/app/(app)/customers/new/_lib/wizard/wizard-types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// Same per-control decomposition as the earlier steps: each select/checkbox
// owns its atomic selector + setter and broadcasts its render under its field
// name, so toggling one control re-renders only that control.

const DefaultCurrencyField = () => {
  const defaultCurrency = useWizardStore((s) => s.preferences.defaultCurrency);
  const setPreferenceField = useWizardStore((s) => s.setPreferenceField);
  useBroadcastRender('defaultCurrency');

  return (
    <div className="space-y-2">
      <Label htmlFor="defaultCurrency">Default currency</Label>
      <select
        id="defaultCurrency"
        data-testid="field-defaultCurrency"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        value={defaultCurrency}
        onChange={(e) => setPreferenceField('defaultCurrency', e.target.value)}
      >
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
      </select>
    </div>
  );
};

const LanguageField = () => {
  const language = useWizardStore((s) => s.preferences.language);
  const setPreferenceField = useWizardStore((s) => s.setPreferenceField);
  useBroadcastRender('language');

  return (
    <div className="space-y-2">
      <Label htmlFor="language">Language</Label>
      <select
        id="language"
        data-testid="field-language"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        value={language}
        onChange={(e) =>
          setPreferenceField(
            'language',
            e.target.value as PreferencesSlice['preferences']['language'],
          )
        }
      >
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="fr-FR">Français</option>
      </select>
    </div>
  );
};

const ChannelsField = () => {
  const channels = useWizardStore((s) => s.preferences.channels);
  const togglePreferenceChannel = useWizardStore(
    (s) => s.togglePreferenceChannel,
  );
  useBroadcastRender('channels');

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Notification channels</legend>
      <div className="flex items-center gap-2">
        <Checkbox
          id="channel-email"
          data-testid="channel-email"
          checked={channels.includes('email')}
          onCheckedChange={() => togglePreferenceChannel('email')}
        />
        <Label htmlFor="channel-email">Email</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="channel-sms"
          data-testid="channel-sms"
          checked={channels.includes('sms')}
          onCheckedChange={() => togglePreferenceChannel('sms')}
        />
        <Label htmlFor="channel-sms">SMS</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="channel-inApp"
          data-testid="channel-inApp"
          checked={channels.includes('inApp')}
          onCheckedChange={() => togglePreferenceChannel('inApp')}
        />
        <Label htmlFor="channel-inApp">In-app</Label>
      </div>
    </fieldset>
  );
};

const Step3Page = () => (
  <div data-testid="step-3" className="space-y-4">
    <h2 className="text-lg font-medium">Preferences</h2>
    <DefaultCurrencyField />
    <LanguageField />
    <ChannelsField />
  </div>
);

export default Step3Page;
