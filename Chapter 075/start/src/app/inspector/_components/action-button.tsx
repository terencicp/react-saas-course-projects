'use client';

import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';

// A button that submits a zero-arg Server Action via a <form action>. Used for every
// inspector control (spam, send-one, reset-counters, toggles, runners) so each is a
// real progressive-enhancement submit, not an onClick fetch. `data-testid` and the
// shadcn Button props forward through.
type ActionButtonProps = ComponentProps<typeof Button> & {
  action: () => Promise<void>;
  children: ReactNode;
};

export const ActionButton = ({
  action,
  children,
  ...props
}: ActionButtonProps) => (
  <form action={action}>
    <Button type="submit" {...props}>
      {children}
    </Button>
  </form>
);
