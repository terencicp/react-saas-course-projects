'use client';

import { MoreHorizontalIcon } from 'lucide-react';
import type { Route } from 'next';
import { useFormatter, useTranslations } from 'next-intl';
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

// S1 routes the column headers, status/badge labels, and the row-action labels
// through `useTranslations('invoices.list')` (status via `t('status.<value>')`).
// S2 moves the value cells onto the formatter seam via `useFormatter`:
//   - `invoice-date`: `format.dateTime(new Date(row.createdAtMs), { …, timeZone })`
//     — `timeZone` is mandatory; it does the wall-clock/DST work after the
//     Instant→Date conversion. Omitting it silently renders the runtime tz.
//   - `invoice-amount`: `format.number(row.amountMinor / 100, 'currency', { currency: row.currency })`
//     — the named `currency` preset (narrow symbol) plus the row's own currency.
//   - `invoice-due-relative`: `format.relativeTime` handed the calendar due date
//     and the stable per-render `now`; the integer day delta is computed on the
//     server (one Temporal `until` call) and passed in as `dueInDaysById`.
// The calendar due date pins `timeZone: 'UTC'` so a zone-independent `PlainDate`
// never shifts across the viewer's zone.

// Shift a `Date` by whole days — the relative-due anchor builds the target date
// `now + days` so `format.relativeTime` reads the delta against the stable `now`.
const addDays = (now: Date, days: number): Date =>
  new Date(now.getTime() + days * 86_400_000);

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
  timeZone,
  nowMs,
  dueInDaysById,
}: {
  rows: InvoiceRow[];
  view: InvoiceView;
  role: Role;
  timeZone: string;
  nowMs: number;
  dueInDaysById: Record<string, number>;
}) => {
  const t = useTranslations('invoices.list');
  const format = useFormatter();
  // Stable across the render so the relative-due cell never drifts between server
  // and client paint; the server read the clock once (after a request-time
  // source) and handed it down.
  const now = new Date(nowMs);

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
          <th className="py-2 font-medium">{t('columns.number')}</th>
          <th className="py-2 font-medium">{t('columns.customer')}</th>
          <th className="py-2 font-medium">{t('columns.status')}</th>
          <th className="py-2 font-medium">{t('columns.date')}</th>
          <th className="py-2 font-medium">{t('columns.due')}</th>
          <th className="py-2 text-right font-medium">{t('columns.amount')}</th>
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
                      {t('badge.deleted')}
                    </Badge>
                  ) : null}
                  {row.archivedAt && !row.deletedAt ? (
                    <Badge data-testid="badge-archived" variant="secondary">
                      {t('badge.archived')}
                    </Badge>
                  ) : null}
                </div>
                {view === 'archived' && row.archivedAt ? (
                  <div
                    data-testid="archived-on"
                    className="text-xs text-muted-foreground"
                  >
                    {t('badge.archived')}{' '}
                    {format.dateTime(new Date(row.archivedAt), {
                      dateStyle: 'medium',
                      timeZone,
                    })}
                  </div>
                ) : null}
              </td>
              <td data-testid="invoice-status" className="py-2">
                {t(`status.${row.status}`)}
              </td>
              {/* Created moment in the viewer's profile tz — `timeZone` is what
                  makes the Instant→Date conversion DST-correct. */}
              <td
                data-testid="invoice-date"
                className="py-2 tabular-nums text-muted-foreground"
              >
                {format.dateTime(new Date(row.createdAtMs), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone,
                })}
              </td>
              {/* Relative due date: the server-computed integer day delta against
                  the stable `now`. next-intl applies CLDR `numeric: 'auto'`
                  internally, so this reads "tomorrow"/"in N days"/"il y a N
                  jours" per locale. */}
              <td
                data-testid="invoice-due-relative"
                className="py-2 text-muted-foreground"
              >
                {format.relativeTime(addDays(now, dueInDaysById[row.id] ?? 0), {
                  now,
                  unit: 'day',
                })}
              </td>
              {/* Amount: minor units / 100 at display, the narrow-symbol preset,
                  the row's own currency (data) at the call site. */}
              <td
                data-testid="invoice-amount"
                className="py-2 text-right tabular-nums"
              >
                {format.number(row.amountMinor / 100, 'currency', {
                  currency: row.currency,
                })}
              </td>
              <td className="py-2 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-testid="row-actions"
                      aria-label={t('actions.label')}
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/invoices/${row.id}/edit` as Route}>
                        {t('actions.edit')}
                      </Link>
                    </DropdownMenuItem>
                    {isActive ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          data-testid="row-action-archive"
                          onSelect={() => onArchive(row)}
                        >
                          {t('actions.archive')}
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
                          {t('actions.restore')}
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
                          {t('actions.undelete')}
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
                          {t('actions.delete')}
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
