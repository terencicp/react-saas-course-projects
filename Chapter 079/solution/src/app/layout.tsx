import './globals.css';

import type { Metadata } from 'next';
import Link from 'next/link';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Providers } from '@/app/_components/providers';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Customers — routed wizard',
  description:
    'An in-memory customers surface with a four-step routed "new customer" wizard backed by a per-request Zustand store.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body className="font-sans antialiased">
      <Providers>
        {/* NuqsAdapter is load-bearing: the customers list's search/cursor hooks
            throw at runtime without it. */}
        <NuqsAdapter>
          <header className="border-b">
            <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
              <span className="font-semibold">Customers</span>
              <Link
                className="text-muted-foreground hover:text-foreground"
                href="/customers"
              >
                List
              </Link>
              <Link
                className="text-muted-foreground hover:text-foreground"
                href="/customers/new/step-1"
              >
                New customer
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
