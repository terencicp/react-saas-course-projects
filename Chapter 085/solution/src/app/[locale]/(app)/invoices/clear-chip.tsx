'use client';

import { XIcon } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { invoiceListSearchParams } from '@/lib/invoices/search-params';

type ClearableParam = 'status' | 'q' | 'sort';

export const ClearChip = ({
  param,
  label,
}: {
  param: ClearableParam;
  label: string;
}) => {
  const [, setQueryStates] = useQueryStates(
    {
      status: invoiceListSearchParams.status,
      q: invoiceListSearchParams.q,
      sort: invoiceListSearchParams.sort,
      cursor: invoiceListSearchParams.cursor,
    },
    { shallow: false },
  );

  const clear = () => {
    switch (param) {
      case 'status':
        return setQueryStates({ status: null, cursor: null });
      case 'q':
        return setQueryStates({ q: null, cursor: null });
      case 'sort':
        return setQueryStates({ sort: null, cursor: null });
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      onClick={clear}
      className="ms-1 rounded-sm opacity-70 hover:opacity-100"
    >
      <XIcon className="size-3" />
    </button>
  );
};
