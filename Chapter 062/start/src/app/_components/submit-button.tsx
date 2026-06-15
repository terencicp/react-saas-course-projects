'use client';

import type { ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

// A submit button that reads the enclosing form's pending state from
// `useFormStatus` (it must be a descendant of the `<form>`, not the form root).
export const SubmitButton = ({
  children,
  pendingLabel = 'Saving…',
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
};
