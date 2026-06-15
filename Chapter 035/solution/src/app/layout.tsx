import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/_components/providers';

export const metadata: Metadata = {
  title: 'Invoices',
  description:
    'A list-plus-detail invoicing workspace built with the Next.js App Router — parallel routes, URL-driven view state, and an intercepting modal.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body className="font-sans antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
