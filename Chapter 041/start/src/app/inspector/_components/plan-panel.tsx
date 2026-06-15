import { getDetailPlan, getListPlan } from '@/lib/invoices/explain';
import type { InvoiceStatus } from '@/lib/invoices/schema';

type PlanPanelProps = {
  organizationId: string;
  status: InvoiceStatus | undefined;
  invoiceId: string | undefined;
};

export const PlanPanel = async ({
  organizationId,
  status,
  invoiceId,
}: PlanPanelProps) => {
  const plan = invoiceId
    ? await getDetailPlan({ organizationId, invoiceId })
    : await getListPlan({ organizationId, status });

  const label = invoiceId
    ? 'EXPLAIN ANALYZE — detail query'
    : 'EXPLAIN ANALYZE — list query';

  return (
    <section data-testid="plan-panel">
      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          {label}
        </summary>
        <pre
          data-testid="plan-text"
          className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-card-foreground"
        >
          {plan}
        </pre>
      </details>
    </section>
  );
};
