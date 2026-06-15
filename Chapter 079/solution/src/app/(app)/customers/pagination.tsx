'use client';

import { useQueryState } from 'nuqs';
import { Button } from '@/components/ui/button';
import { customerListSearchParams } from '@/lib/customers/search-params';

type PaginationProps = {
  cursor: string | null;
  nextCursor: string | null;
};

export const Pagination = ({ nextCursor }: PaginationProps) => {
  const [cursor, setCursor] = useQueryState(
    'cursor',
    customerListSearchParams.cursor.withOptions({ shallow: false }),
  );

  return (
    <nav
      data-testid="customers-pagination"
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
