'use client';

import { Button } from '@/components/ui/button';

type PaginationProps = {
  cursor: string | null;
  nextCursor: string | null;
  hasPrev: boolean;
};

// TODO(L2) — wire cursor next/first via useQueryState.
//
// Read `cursor` with `useQueryState('cursor', cursorParser.withOptions({
// shallow: false }))`; "Next" sets `nextCursor`, "First page" sets `null` to
// strip the param. Disable "Next" when there is no `nextCursor` and "First page"
// when `cursor == null`. The buttons below are inert until then.
export const Pagination = (_props: PaginationProps) => (
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
      disabled
    >
      First page
    </Button>
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="pagination-next"
      disabled
    >
      Next
    </Button>
  </nav>
);
