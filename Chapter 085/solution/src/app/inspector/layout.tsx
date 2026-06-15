import { NextIntlClientProvider } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { type ReactNode, Suspense } from 'react';
import { Providers } from '@/app/_components/providers';
import { Toaster } from '@/components/ui/sonner';
import enUS from '@/messages/en-US.json';

// The inspector is locale-agnostic (it deep-links into `/[locale]/invoices`), so
// it owns its OWN document shell with a fixed `lang="en-US"`. This is the second
// (and last) `<html>` in the app; the root layout is a bare fragment and the
// `[locale]/layout.tsx` owns the localized document.
//
// Under Cache Components the server-rendered `NextIntlClientProvider` reads
// request configuration at the document boundary even with explicit
// `locale`/`messages` props — a page-level `loading.tsx` can't guard that, so the
// provider is wrapped in a `<Suspense>` boundary inside `<body>`. Without it,
// `next build` fails the inspector with "Uncached data was accessed outside of
// `<Suspense>`".
const InspectorLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en-US" suppressHydrationWarning>
    <body className="font-sans antialiased">
      <Providers>
        <NuqsAdapter>
          <Suspense>
            <NextIntlClientProvider locale="en-US" messages={enUS}>
              <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
              <Toaster />
            </NextIntlClientProvider>
          </Suspense>
        </NuqsAdapter>
      </Providers>
    </body>
  </html>
);

export default InspectorLayout;
