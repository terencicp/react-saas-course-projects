'use client';

import type { ListParsed } from '@/lib/invoices/queries';
import { cn } from '@/lib/utils';
import type { Role } from '@/server/types';

// TODO(L2) — write view (+cursor:null) via a nuqs setter so the tab is the
// source of truth for the `view` param.
// TODO(L3) — hide the `all` tab unless `role === 'admin'` (cosmetic on top of
// the read-layer RBAC gate).
//
// This baseline always shows all three tabs and does not write the URL on click,
// so only the default `active` view returns correct rows until L3.
export const ViewTabs = ({
  parsed,
  role: _role,
}: {
  parsed: ListParsed;
  role: Role;
}) => {
  const tabs: { value: ListParsed['view']; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div data-testid="view-tabs" className="flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          data-testid={`view-tab-${tab.value}`}
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
