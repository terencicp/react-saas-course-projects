import './globals.css';

import type { Metadata } from 'next';
import Link from 'next/link';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Providers } from '@/app/_components/providers';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Invoices — TanStack Query comment thread',
  description:
    'An in-memory invoices app with a polling, infinite-scrolling, optimistically-added comment thread on the invoice detail page, powered by TanStack Query scoped to a single client leaf.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body className="font-sans antialiased">
      <Providers>
        {/* NuqsAdapter is load-bearing: without it every nuqs client hook throws
            at runtime and the toolbar/pagination break. */}
        <NuqsAdapter>
          <header className="border-b">
            <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
              <span className="font-semibold">Invoices</span>
              <Link
                className="text-muted-foreground hover:text-foreground"
                href="/invoices"
              >
                List
              </Link>
              <Link
                className="text-muted-foreground hover:text-foreground"
                href="/inspector"
              >
                Inspector
              </Link>
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <Toaster />
        </NuqsAdapter>
      </Providers>
    </body>
  </html>
);

export default RootLayout;
