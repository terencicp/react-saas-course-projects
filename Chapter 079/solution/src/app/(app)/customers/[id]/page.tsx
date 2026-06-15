import { notFound } from 'next/navigation';
import { getCustomerDetail } from '@/lib/customers/queries';
import { getSession } from '@/server/session';

type DetailPageProps = {
  params: Promise<{ id: string }>;
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 border-b py-2 last:border-b-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right font-medium">{value}</dd>
  </div>
);

const CustomerDetailPage = async ({ params }: DetailPageProps) => {
  const { id } = await params;
  const session = await getSession();

  const customer = getCustomerDetail({ orgId: session.orgId, id });

  if (!customer) {
    notFound();
  }

  return (
    <div data-testid="customer-detail" className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">
        {customer.firstName} {customer.lastName}
      </h1>
      <dl className="rounded-lg border p-4 text-sm">
        <Row label="Email" value={customer.email} />
        <Row label="Phone" value={customer.phone} />
        <Row
          label="Address"
          value={`${customer.line1}, ${customer.city} ${customer.region} ${customer.postalCode}, ${customer.country}`}
        />
        <Row label="Tax ID" value={customer.taxId} />
        <Row label="Payment terms" value={customer.paymentTerms} />
        <Row label="Currency" value={customer.defaultCurrency} />
        <Row label="Language" value={customer.language} />
        <Row
          label="Channels"
          value={customer.notificationChannels.join(', ') || '—'}
        />
      </dl>
    </div>
  );
};

export default CustomerDetailPage;
