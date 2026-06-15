import './globals.css';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
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
      {/*
        The cookieless analytics floor (093 L1): @vercel/analytics +
        @vercel/speed-insights mounted once, UNGATED — deliberate, not a finding. They
        carry no user-identifying signal and do not require consent. Do not "fix" them
        with the PostHog consent gate (finding 4).
      */}
      <Analytics />
      <SpeedInsights />
    </body>
  </html>
);

export default RootLayout;
