'use client';

import { MoreHorizontalIcon } from 'lucide-react';
import type { Route } from 'next';
import { useActionState, useEffect, useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// Locale-aware Link: rendered at `/fr-FR/invoices`, `href="/invoices/…"`
// resolves to `/fr-FR/invoices/…` automatically — never hand-prefix.
import { Link } from '@/i18n/navigation';
import {
  archiveInvoice,
  restoreInvoice,
  softDeleteInvoice,
} from '@/lib/invoices/actions';
import type { InvoiceRow, InvoiceView } from '@/lib/invoices/queries';
import type { Result } from '@/lib/result';
import type { Role } from '@/server/types';

// TODO(L2) — t() for labels/status
// TODO(L3) — format.dateTime/number + relativeTime
//
// Starter state: ch062-baseline cells — hard-coded column headers and labels,
// `capitalize` status, `{row.currency} {row.total}` amount, `toLocaleDateString`
// for the archived-on line. S1 routes the column headers, status/badge labels,
// and row-action labels through `useTranslations('invoices.list')`. S2 moves the
// value cells onto the formatter seam via `useFormatter` (date in the profile
// `timeZone`, amount via `format.number(amountMinor / 100, 'currency', { currency })`,
// a relative-due column), receiving `timeZone`/`nowMs`/`dueInDaysById` from the page.

// Fire one toast per resolved Result: a success line on `ok`, the conflict line
// on a stale precondition, and the server's message on any other refusal.
const useResultToast = (
  state: Result<InvoiceRow> | null,
  successMessage: string,
) => {
  useEffect(() => {
    if (!state) {
      return;
    }
    if (state.ok) {
      toast.success(successMessage);
      return;
    }
    toast.error(
      state.error.code === 'conflict'
        ? 'This invoice changed elsewhere — refresh to retry.'
        : state.error.userMessage,
    );
  }, [state, successMessage]);
};

export const InvoicesTable = ({
  rows,
  view,
  role,
}: {
  rows: InvoiceRow[];
  view: InvoiceView;
  role: Role;
}) => {
  // Optimistic archive: a row leaves the table the instant the user clicks.
  // The optimistic value is never committed — it expires when the action's
  // transition ends. On `ok` the revalidated `rows` no longer carries the row,
  // so it stays gone; on `{ ok: false }` `rows` is unchanged and the row
  // reappears. This is expiry, not a throw-and-rollback.
  const [visibleRows, archiveOptimistic] = useOptimistic(
    rows,
    (current: InvoiceRow[], removedId: string) =>
      current.filter((row) => row.id !== removedId),
  );

  // One action-state per lifecycle action, lifted to the table so the result
  // and its toast survive the optimistic removal of the row that triggered it.
  const [archiveState, archiveDispatch] = useActionState(archiveInvoice, null);
  const [restoreState, restoreDispatch] = useActionState(restoreInvoice, null);
  const [deleteState, deleteDispatch] = useActionState(softDeleteInvoice, null);

  // The menu's `onSelect` is a plain event handler, not a form action, so the
  // optimistic write must share an explicit transition with the dispatch — an
  // optimistic update applied outside a transition would be rejected.
  const [, startArchive] = useTransition();

  useResultToast(archiveState, 'Invoice archived.');
  useResultToast(restoreState, 'Invoice restored.');
  useResultToast(deleteState, 'Invoice deleted.');

  // Build the `id`+`version` FormData a lifecycle action expects. The row
  // actions live in a Radix menu that unmounts its (portaled) items the instant
  // one is selected, so a `<button type="submit" form=…>` inside an item never
  // gets to fire its native submit. Instead each item's `onSelect` calls the
  // matching `useActionState` dispatcher directly with this FormData — the same
  // dispatch the form would have triggered, minus the doomed native submit.
  const lifecycleFormData = (row: InvoiceRow) => {
    const formData = new FormData();
    formData.set('id', row.id);
    formData.set('version', String(row.version));
    return formData;
  };

  const onArchive = (row: InvoiceRow) => {
    startArchive(() => {
      archiveOptimistic(row.id);
      archiveDispatch(lifecycleFormData(row));
    });
  };

  return (
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
        {visibleRows.map((row) => {
          const isActive = row.deletedAt === null && row.archivedAt === null;
          const canDelete = isActive && role === 'admin';
          const canRestore = row.archivedAt !== null && row.deletedAt === null;
          const canUndelete = row.deletedAt !== null && role === 'admin';

          return (
            <tr key={row.id} data-testid="invoice-row" className="border-b">
              <td className="py-2">
                <Link
                  className="hover:underline"
                  href={`/invoices/${row.id}/edit` as Route}
                >
                  {row.number}
                </Link>
              </td>
              <td className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{row.customerName}</span>
                  {row.deletedAt ? (
                    <Badge data-testid="badge-deleted" variant="destructive">
                      Deleted
                    </Badge>
                  ) : null}
                  {row.archivedAt && !row.deletedAt ? (
                    <Badge data-testid="badge-archived" variant="secondary">
                      Archived
                    </Badge>
                  ) : null}
                </div>
                {view === 'archived' && row.archivedAt ? (
                  <div
                    data-testid="archived-on"
                    className="text-xs text-muted-foreground"
                  >
                    Archived on {new Date(row.archivedAt).toLocaleDateString()}
                  </div>
                ) : null}
              </td>
              <td data-testid="invoice-status" className="py-2 capitalize">
                {row.status}
              </td>
              <td
                data-testid="invoice-amount"
                className="py-2 text-right tabular-nums"
              >
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
                      <Link href={`/invoices/${row.id}/edit` as Route}>
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    {isActive ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          data-testid="row-action-archive"
                          onSelect={() => onArchive(row)}
                        >
                          Archive
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {canRestore ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          data-testid="row-action-restore"
                          onSelect={() =>
                            restoreDispatch(lifecycleFormData(row))
                          }
                        >
                          Restore
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {canUndelete ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          data-testid="row-action-undelete"
                          onSelect={() =>
                            restoreDispatch(lifecycleFormData(row))
                          }
                        >
                          Restore deleted
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {canDelete ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          data-testid="row-action-delete"
                          onSelect={() =>
                            deleteDispatch(lifecycleFormData(row))
                          }
                        >
                          Delete
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
