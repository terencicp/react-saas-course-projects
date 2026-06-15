'use client';

import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

type SubmitButtonProps = {
  children: ReactNode;
  variant?: ComponentProps<typeof Button>['variant'];
};

export const SubmitButton = ({ children, variant }: SubmitButtonProps) => {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending && (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
      )}
      {children}
    </Button>
  );
};
