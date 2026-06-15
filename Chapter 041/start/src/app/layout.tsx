import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/_components/providers';

export const metadata: Metadata = {
  title: 'Invoicing data layer',
  description:
    'An org-scoped invoicing data layer built with Drizzle and Postgres — a tenant-aware schema, a deterministic seed, and two tenant-scoped reads surfaced by the inspector.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body className="font-sans antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
