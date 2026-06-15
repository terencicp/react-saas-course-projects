import { ClearChip } from '@/app/(app)/invoices/clear-chip';
import type { InvoiceSort, ListParsed } from '@/lib/invoices/queries';

const SORT_LABELS: Record<InvoiceSort, string> = {
  '-createdAt': 'Newest first',
  createdAt: 'Oldest first',
  '-total': 'Total: high to low',
  total: 'Total: low to high',
  '-customer': 'Customer: Z–A',
  customer: 'Customer: A–Z',
};

const chipClassName =
  'inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 text-xs';

export const ActiveFilterChips = ({ parsed }: { parsed: ListParsed }) => (
  <div
    data-testid="active-filter-chips"
    className="flex min-h-6 flex-wrap items-center gap-2"
  >
    {parsed.status !== null && (
      <span data-testid="chip-status" className={chipClassName}>
        <span className="capitalize">Status: {parsed.status}</span>
        <ClearChip param="status" label="Clear status filter" />
      </span>
    )}
    {parsed.q !== '' && (
      <span data-testid="chip-q" className={chipClassName}>
        Search: “{parsed.q}”
        <ClearChip param="q" label="Clear search" />
      </span>
    )}
    {parsed.sort !== '-createdAt' && (
      <span data-testid="chip-sort" className={chipClassName}>
        Sort: {SORT_LABELS[parsed.sort]}
        <ClearChip param="sort" label="Reset sort" />
      </span>
    )}
  </div>
);
