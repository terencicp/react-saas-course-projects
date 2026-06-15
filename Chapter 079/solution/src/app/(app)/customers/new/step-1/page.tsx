'use client';

import { useBroadcastRender } from '@/app/(app)/customers/new/_components/use-broadcast-render';
import { useWizardStore } from '@/app/(app)/customers/new/_components/use-wizard-store';
import { selectStepErrors } from '@/app/(app)/customers/new/_lib/wizard/selectors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Each field is its OWN client component subscribing to its own atomic selector
// + setter + atomic error primitive, so typing one field re-renders only that
// field's component — the sibling fields and the parent step page stay flat.
// `useBroadcastRender('<field>')` reports each render to the inspector's
// re-render-counter panel. The parent `Step1Page` subscribes to nothing that
// changes on a keystroke, so it never re-renders mid-typing.

const FirstNameField = () => {
  const firstName = useWizardStore((s) => s.contact.firstName);
  const setContactField = useWizardStore((s) => s.setContactField);
  const error = useWizardStore((s) => selectStepErrors(s).firstName?.[0]);
  useBroadcastRender('firstName');

  return (
    <div className="space-y-2">
      <Label htmlFor="firstName">First name</Label>
      <Input
        id="firstName"
        data-testid="field-firstName"
        value={firstName}
        onChange={(e) => setContactField('firstName', e.target.value)}
      />
      {error ? (
        <p data-testid="error-firstName" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const LastNameField = () => {
  const lastName = useWizardStore((s) => s.contact.lastName);
  const setContactField = useWizardStore((s) => s.setContactField);
  const error = useWizardStore((s) => selectStepErrors(s).lastName?.[0]);
  useBroadcastRender('lastName');

  return (
    <div className="space-y-2">
      <Label htmlFor="lastName">Last name</Label>
      <Input
        id="lastName"
        data-testid="field-lastName"
        value={lastName}
        onChange={(e) => setContactField('lastName', e.target.value)}
      />
      {error ? (
        <p data-testid="error-lastName" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const EmailField = () => {
  const email = useWizardStore((s) => s.contact.email);
  const setContactField = useWizardStore((s) => s.setContactField);
  const error = useWizardStore((s) => selectStepErrors(s).email?.[0]);
  useBroadcastRender('email');

  return (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        data-testid="field-email"
        value={email}
        onChange={(e) => setContactField('email', e.target.value)}
      />
      {error ? (
        <p data-testid="error-email" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const PhoneField = () => {
  const phone = useWizardStore((s) => s.contact.phone);
  const setContactField = useWizardStore((s) => s.setContactField);
  const error = useWizardStore((s) => selectStepErrors(s).phone?.[0]);
  useBroadcastRender('phone');

  return (
    <div className="space-y-2">
      <Label htmlFor="phone">Phone</Label>
      <Input
        id="phone"
        data-testid="field-phone"
        value={phone}
        onChange={(e) => setContactField('phone', e.target.value)}
      />
      {error ? (
        <p data-testid="error-phone" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const Step1Page = () => (
  <div data-testid="step-1" className="space-y-4">
    <h2 className="text-lg font-medium">Contact</h2>
    <FirstNameField />
    <LastNameField />
    <EmailField />
    <PhoneField />
  </div>
);

export default Step1Page;
