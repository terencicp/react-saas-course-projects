'use client';

import { useQueryState } from 'nuqs';
import { Button } from '@/components/ui/button';
import { invoiceListSearchParams } from '@/lib/invoices/search-params';

type PaginationProps = {
  cursor: string | null;
  nextCursor: string | null;
  hasPrev: boolean;
};

export const Pagination = ({ nextCursor }: PaginationProps) => {
  const [cursor, setCursor] = useQueryState(
    'cursor',
    invoiceListSearchParams.cursor.withOptions({ shallow: false }),
  );

  // TODO(L2) — route the aria-label and the two button labels ("First page",
  // "Next") through `useTranslations('invoices.list.pagination')`; no hard-coded
  // JSX strings (or aria-labels) under [locale]/.
  return (
    <nav
      data-testid="pagination"
      aria-label="Pagination"
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
        First page
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="pagination-next"
        disabled={!nextCursor}
        onClick={() => setCursor(nextCursor)}
      >
        Next
      </Button>
    </nav>
  );
};
