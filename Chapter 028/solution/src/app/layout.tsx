import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/_components/providers';

export const metadata: Metadata = {
  title: 'Themed Product Surface',
  description:
    'A static, themed marketing surface built with Next.js, React, Tailwind, and shadcn/ui.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body className="font-sans antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
