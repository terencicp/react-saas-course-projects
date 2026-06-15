'use client';

import { useShallow } from 'zustand/react/shallow';
import { useWizardStore } from '@/app/(app)/customers/new/_components/use-wizard-store';
import { SubmitButton } from '@/app/(app)/customers/new/step-4/submit-button';

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 border-b py-1.5 last:border-b-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right font-medium">{value}</dd>
  </div>
);

// The review surface — the one place `useShallow` belongs: it reads three slice
// objects into one fresh literal each render, so the shallow equality check
// keeps the subscription stable. Every subsection is read-only; the submit
// button assembles the payload from its own pick.
const Step4Page = () => {
  const { contact, billing, preferences } = useWizardStore(
    useShallow((s) => ({
      contact: s.contact,
      billing: s.billing,
      preferences: s.preferences,
    })),
  );

  return (
    <div data-testid="step-4" className="space-y-6">
      <h2 className="text-lg font-medium">Review</h2>

      <section data-testid="review-contact" className="space-y-2">
        <h3 className="text-sm font-medium">Contact</h3>
        <dl className="rounded-lg border p-3 text-sm">
          <Row
            label="Name"
            value={`${contact.firstName} ${contact.lastName}`}
          />
          <Row label="Email" value={contact.email} />
          <Row label="Phone" value={contact.phone} />
        </dl>
      </section>

      <section data-testid="review-billing" className="space-y-2">
        <h3 className="text-sm font-medium">Billing</h3>
        <dl className="rounded-lg border p-3 text-sm">
          <Row
            label="Address"
            value={`${billing.line1}${billing.line2 ? `, ${billing.line2}` : ''}, ${billing.city} ${billing.region} ${billing.postalCode}, ${billing.country}`}
          />
          <Row label="Tax ID" value={billing.taxId} />
          <Row label="Payment terms" value={billing.paymentTerms} />
        </dl>
      </section>

      <section data-testid="review-preferences" className="space-y-2">
        <h3 className="text-sm font-medium">Preferences</h3>
        <dl className="rounded-lg border p-3 text-sm">
          <Row label="Currency" value={preferences.defaultCurrency} />
          <Row label="Language" value={preferences.language} />
          <Row
            label="Channels"
            value={preferences.channels.join(', ') || '—'}
          />
        </dl>
      </section>

      <SubmitButton />
    </div>
  );
};

export default Step4Page;
