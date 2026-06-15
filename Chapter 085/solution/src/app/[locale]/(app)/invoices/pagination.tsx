'use client';

import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { Button } from '@/components/ui/button';
import { invoiceListSearchParams } from '@/lib/invoices/search-params';

type PaginationProps = {
  cursor: string | null;
  nextCursor: string | null;
  hasPrev: boolean;
};

export const Pagination = ({ nextCursor }: PaginationProps) => {
  const t = useTranslations('invoices.list.pagination');
  const [cursor, setCursor] = useQueryState(
    'cursor',
    invoiceListSearchParams.cursor.withOptions({ shallow: false }),
  );

  return (
    <nav
      data-testid="pagination"
      aria-label={t('label')}
      className="flex items-center justify-end gap-2"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="pagination-first"
        disabled={cursor == null}
        onClick={() => setCursor(null)}
      >
        {t('first')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="pagination-next"
        disabled={!nextCursor}
        onClick={() => setCursor(nextCursor)}
      >
        {t('next')}
      </Button>
    </nav>
  );
};
