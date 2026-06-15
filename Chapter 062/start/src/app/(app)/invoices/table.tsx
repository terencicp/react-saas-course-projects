'use client';

import { MoreHorizontalIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InvoiceView } from '@/lib/invoices/queries';
import type { Invoice, Role } from '@/server/types';

// TODO(L3) — render archived/deleted badges + the "Archived on …" label.
// TODO(L4) — wire archive/restore/delete row actions + optimistic archive.
//
// This baseline renders the rows and a row action menu with only "Edit". The
// student adds the lifecycle badges (L3) and the row-action forms driven through
// `useActionState`, plus optimistic archive via `useOptimistic` (L4).
export const InvoicesTable = ({
  rows,
  view: _view,
  role: _role,
}: {
  rows: Invoice[];
  view: InvoiceView;
  role: Role;
}) => (
  <table data-testid="invoices-table" className="w-full text-sm">
    <thead className="text-left text-muted-foreground">
      <tr className="border-b">
        <th className="py-2 font-medium">Number</th>
        <th className="py-2 font-medium">Customer</th>
        <th className="py-2 font-medium">Status</th>
        <th className="py-2 text-right font-medium">Total</th>
        <th className="py-2" />
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} data-testid="invoice-row" className="border-b">
          <td className="py-2">
            <Link
              className="hover:underline"
              href={`/invoices/${row.id}/edit` as Route}
            >
              {row.number}
            </Link>
          </td>
          <td className="py-2">{row.customerName}</td>
          <td className="py-2 capitalize">{row.status}</td>
          <td className="py-2 text-right tabular-nums">
            {row.currency} {row.total}
          </td>
          <td className="py-2 text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid="row-actions"
                  aria-label="Row actions"
                >
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/invoices/${row.id}/edit` as Route}>Edit</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);
