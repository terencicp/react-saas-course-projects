'use client';

import { useQueryStates } from 'nuqs';

import type { Role } from '@/lib/auth/roles';
import type { ListParsed } from '@/lib/invoices/queries';
import { invoiceListSearchParams } from '@/lib/invoices/search-params';
import { cn } from '@/lib/utils';

export const ViewTabs = ({
  parsed,
  role,
}: {
  parsed: ListParsed;
  role: Role;
}) => {
  const [, setQueryStates] = useQueryStates(
    {
      view: invoiceListSearchParams.view,
      cursor: invoiceListSearchParams.cursor,
    },
    { shallow: false },
  );

  // The `all` tab is cosmetic on top of the read-layer RBAC gate: hide it from
  // non-admins (the read already serves them active rows if they hand-type it).
  const tabs: { value: ListParsed['view']; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    ...(role === 'admin' ? [{ value: 'all' as const, label: 'All' }] : []),
  ];

  return (
    <div data-testid="view-tabs" className="flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          data-testid={`view-tab-${tab.value}`}
          onClick={() => setQueryStates({ view: tab.value, cursor: null })}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm',
            parsed.view === tab.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
