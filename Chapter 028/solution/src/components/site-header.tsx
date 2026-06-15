import Link from 'next/link';

import { MobileNav } from '@/components/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { navLinks } from '@/lib/data';

export const SiteHeader = () => (
  <header
    data-testid="site-header"
    className="sticky top-0 z-50 border-b border-border bg-background"
  >
    <div className="container mx-auto flex h-16 items-center justify-between px-4">
      <Link
        href="/"
        className="rounded-md text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Acme
      </Link>

      <div className="flex items-center gap-2">
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div data-testid="theme-toggle-slot">
          <ThemeToggle />
        </div>
        <div data-testid="header-mobile-slot" className="md:hidden">
          <MobileNav links={navLinks} />
        </div>
      </div>
    </div>
  </header>
);
