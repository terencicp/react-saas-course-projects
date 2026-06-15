import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/_components/providers';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Invoices',
  description:
    'A full CRUD surface on the org-scoped invoicing data layer — create, edit, and delete invoices through Server Actions with native forms.',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body className="font-sans antialiased">
      <Providers>
        {children}
        {/* Sonner Toaster mounted once at the root — the URL-param success toast renders here. */}
        <Toaster />
      </Providers>
    </body>
  </html>
);

export default RootLayout;
