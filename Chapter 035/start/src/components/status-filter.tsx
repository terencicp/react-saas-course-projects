'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { type InvoiceStatus, statusSchema } from '@/lib/invoices/schema';

const options: { label: string; value?: InvoiceStatus }[] = [
  { label: 'All', value: undefined },
  ...statusSchema.options.map((value) => ({ label: value, value })),
];

export const StatusFilter = ({ current }: { current?: InvoiceStatus }) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const select = (value?: InvoiceStatus) => {
    const next = new URLSearchParams(searchParams);

    if (value) {
      next.set('status', value);
    } else {
      next.delete('status');
    }

    const query = next.toString();
    router.replace(query ? `/invoices?${query}` : '/invoices', {
      scroll: false,
    });
  };

  return (
    <div data-testid="status-filter" className="flex flex-wrap gap-2 p-2">
      {options.map((option) => {
        const active = option.value === current;

        return (
          <Button
            key={option.label}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            onClick={() => select(option.value)}
            className="capitalize"
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
};
