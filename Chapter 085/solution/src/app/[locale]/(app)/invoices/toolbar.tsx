'use client';

import { useTranslations } from 'next-intl';
import { debounce, useQueryStates } from 'nuqs';
import { useDeferredValue, useEffect, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InvoiceSort, ListParsed } from '@/lib/invoices/queries';
import { invoiceListSearchParams } from '@/lib/invoices/search-params';
import type { InvoiceStatus } from '@/server/types';

export const Toolbar = ({ parsed }: { parsed: ListParsed }) => {
  // One namespace at `invoices.list` so the toolbar reaches both the shared
  // `status.*` labels (reused by the filter options) and its own `toolbar.*`.
  const t = useTranslations('invoices.list');
  const [, setQueryStates] = useQueryStates(invoiceListSearchParams, {
    shallow: false,
    limitUrlUpdates: debounce(300),
  });

  const [q, setQ] = useState(parsed.q);
  const deferredQ = useDeferredValue(q);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (deferredQ === parsed.q) {
      return;
    }
    startTransition(() => {
      setQueryStates({ q: deferredQ || null, cursor: null });
    });
  }, [deferredQ, parsed.q, setQueryStates]);

  return (
    <div
      data-testid="toolbar"
      className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
    >
      <Select
        value={parsed.status ?? 'all'}
        onValueChange={(value) =>
          setQueryStates({
            status: value === 'all' ? null : (value as InvoiceStatus),
            cursor: null,
          })
        }
      >
        <SelectTrigger data-testid="filter-status" className="w-36">
          <SelectValue placeholder={t('toolbar.statusPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('toolbar.statusAll')}</SelectItem>
          <SelectItem value="draft">{t('status.draft')}</SelectItem>
          <SelectItem value="sent">{t('status.sent')}</SelectItem>
          <SelectItem value="paid">{t('status.paid')}</SelectItem>
          <SelectItem value="overdue">{t('status.overdue')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={parsed.sort}
        onValueChange={(value) =>
          setQueryStates({ sort: value as InvoiceSort, cursor: null })
        }
      >
        <SelectTrigger data-testid="filter-sort" className="w-44">
          <SelectValue placeholder={t('toolbar.sortPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="-createdAt">{t('toolbar.sort.newest')}</SelectItem>
          <SelectItem value="createdAt">{t('toolbar.sort.oldest')}</SelectItem>
          <SelectItem value="-total">{t('toolbar.sort.totalDesc')}</SelectItem>
          <SelectItem value="total">{t('toolbar.sort.totalAsc')}</SelectItem>
          <SelectItem value="-customer">
            {t('toolbar.sort.customerDesc')}
          </SelectItem>
          <SelectItem value="customer">
            {t('toolbar.sort.customerAsc')}
          </SelectItem>
        </SelectContent>
      </Select>

      <Input
        data-testid="search-input"
        type="search"
        placeholder={t('toolbar.searchPlaceholder')}
        className="w-56"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
    </div>
  );
};
