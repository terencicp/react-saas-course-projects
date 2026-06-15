'use client';

import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

// Props forward to the underlying shadcn Button (which spreads `...props`), so
// callers can pass `data-testid` and any other attribute and have it reach the
// DOM — a plain `{ children; variant? }` shape would silently drop them.
type SubmitButtonProps = ComponentProps<typeof Button> & {
  children: ReactNode;
};

export const SubmitButton = ({ children, ...props }: SubmitButtonProps) => {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
      )}
      {children}
    </Button>
  );
};
