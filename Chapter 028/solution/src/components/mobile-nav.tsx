'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useLockBodyScroll } from '@/hooks/use-lock-body-scroll';

export const MobileNav = ({
  links,
}: {
  links: { href: string; label: string }[];
}) => {
  const [open, setOpen] = useState(false);

  useLockBodyScroll(open);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="mobile-nav-trigger"
          aria-label="Open menu"
        >
          <Menu />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" data-testid="mobile-nav-content">
        <SheetTitle className="px-4 pt-4 text-lg font-semibold tracking-tight">
          Acme
        </SheetTitle>

        <nav aria-label="Primary" className="flex flex-col gap-1 px-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2 px-4 pb-4">
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
};
