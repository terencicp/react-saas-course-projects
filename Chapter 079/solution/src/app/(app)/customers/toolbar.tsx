'use client';

import { debounce, useQueryStates } from 'nuqs';
import { useDeferredValue, useEffect, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { customerListSearchParams } from '@/lib/customers/search-params';

export const CustomersToolbar = ({ q: initialQ }: { q: string }) => {
  const [, setQueryStates] = useQueryStates(customerListSearchParams, {
    shallow: false,
    limitUrlUpdates: debounce(300),
  });

  const [q, setQ] = useState(initialQ);
  const deferredQ = useDeferredValue(q);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (deferredQ === initialQ) {
      return;
    }
    startTransition(() => {
      setQueryStates({ q: deferredQ || null, cursor: null });
    });
  }, [deferredQ, initialQ, setQueryStates]);

  return (
    <div
      data-testid="customers-toolbar"
      className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
    >
      <Input
        data-testid="customers-search"
        type="search"
        placeholder="Search customers…"
        className="w-64"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
    </div>
  );
};
