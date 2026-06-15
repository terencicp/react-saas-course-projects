import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/_components/providers';
import { Toaster } from '@/components/ui/sonner';

// Metadata uses a literal app name (not env.NEXT_PUBLIC_APP_NAME) so the layout
// stays boot-safe while that key is a student-owned stub.
export const metadata: Metadata = {
  title: 'Acme',
  description:
    'Email + password authentication with verification: sign-up, a verification email, sign-in, a gated dashboard, and sign-out.',
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
