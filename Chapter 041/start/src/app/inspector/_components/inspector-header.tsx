import Link from 'next/link';

import { reseed } from '@/app/inspector/actions';
import { Button } from '@/components/ui/button';
import type { InvoiceStatus } from '@/lib/invoices/schema';
import { cn } from '@/lib/utils';

const STATUSES: { value: 'all' | InvoiceStatus; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'draft', label: 'draft' },
  { value: 'sent', label: 'sent' },
  { value: 'paid', label: 'paid' },
  { value: 'overdue', label: 'overdue' },
];

type InspectorHeaderProps = {
  orgs: { id: string; name: string }[];
  activeOrgId: string;
  activeStatus: InvoiceStatus | undefined;
};

// Query-string variations of the declared /inspector route. Typing the return
// as a template literal keeps it assignable to typedRoutes' Route union (a plain
// string built from URLSearchParams would widen and be rejected).
const statusHref = (
  orgId: string,
  status: 'all' | InvoiceStatus,
): `/inspector?${string}` => {
  const params = new URLSearchParams({ orgId });
  if (status !== 'all') params.set('status', status);
  return `/inspector?${params.toString()}`;
};

export const InspectorHeader = ({
  orgs,
  activeOrgId,
  activeStatus,
}: InspectorHeaderProps) => (
  <header
    data-testid="inspector-header"
    className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
  >
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      <nav data-testid="org-switcher" className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">org</span>
        {orgs.map((org) => {
          const active = org.id === activeOrgId;
          return (
            <Link
              key={org.id}
              href={`/inspector?orgId=${org.id}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {org.name}
            </Link>
          );
        })}
      </nav>

      <nav data-testid="status-filter" className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          status
        </span>
        {STATUSES.map((status) => {
          const active =
            status.value === 'all'
              ? activeStatus === undefined
              : status.value === activeStatus;
          return (
            <Link
              key={status.value}
              href={statusHref(activeOrgId, status.value)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {status.label}
            </Link>
          );
        })}
      </nav>
    </div>

    <form data-testid="reseed-form" action={reseed}>
      <Button type="submit" variant="outline" size="sm">
        Reset and re-seed
      </Button>
    </form>
  </header>
);
