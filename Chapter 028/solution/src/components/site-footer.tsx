import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { footerGroups, socialLinks } from '@/lib/data';

export const SiteFooter = () => (
  <footer
    data-testid="site-footer"
    className="border-t border-border bg-background"
  >
    <div className="container mx-auto flex flex-col gap-12 px-4 py-12 lg:py-16">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="flex flex-col items-start gap-4">
          <Link
            href="/"
            className="rounded-md text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Acme
          </Link>
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">
            An accessible, themed SaaS surface you can ship from the very first
            paint.
          </p>
          <div className="flex items-center gap-1">
            {socialLinks.map((link) => (
              <Button key={link.href} asChild size="icon" variant="ghost">
                <a aria-label={link.label} href={link.href}>
                  <link.icon />
                </a>
              </Button>
            ))}
          </div>
        </div>

        {footerGroups.map((group) => (
          <nav
            key={group.heading}
            aria-label={group.heading}
            className="flex flex-col gap-3"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {group.heading}
            </h2>
            <ul className="flex flex-col gap-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        © 2026 Acme, Inc. All rights reserved.
      </p>
    </div>
  </footer>
);
