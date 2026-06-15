'use client';

// TODO(L2) — useFormStatus(); shadcn Button type=submit disabled={pending}; Loader2 spinner with motion-reduce:animate-none.

import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type SubmitButtonProps = {
  children: ReactNode;
  variant?: ComponentProps<typeof Button>['variant'];
};

export const SubmitButton = ({ children, variant }: SubmitButtonProps) => {
  return (
    <Button type="submit" variant={variant}>
      {children}
    </Button>
  );
};
