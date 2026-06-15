import { getRowCounts } from '@/lib/invoices/counts';

const FIGURES = [
  {
    key: 'organizations',
    label: 'organizations',
    testid: 'count-organizations',
  },
  { key: 'users', label: 'users', testid: 'count-users' },
  { key: 'orgMembers', label: 'org_members', testid: 'count-org-members' },
  { key: 'customers', label: 'customers', testid: 'count-customers' },
  { key: 'invoices', label: 'invoices', testid: 'count-invoices' },
  {
    key: 'invoiceLines',
    label: 'invoice_lines',
    testid: 'count-invoice-lines',
  },
] as const;

export const CountsBanner = async () => {
  const counts = await getRowCounts();

  return (
    <section
      data-testid="counts-banner"
      className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6"
    >
      {FIGURES.map((figure) => (
        <div key={figure.key} className="flex flex-col gap-1">
          <span
            data-testid={figure.testid}
            className="text-2xl font-semibold tabular-nums text-card-foreground"
          >
            {counts[figure.key]}
          </span>
          <span className="text-xs text-muted-foreground">{figure.label}</span>
        </div>
      ))}
    </section>
  );
};
