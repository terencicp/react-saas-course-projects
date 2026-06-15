'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

// TODO(L2) — wrap QueryClientProvider + gated devtools
//
// The Ch062 `ThemeProvider` stays. Wrap `{children}` in a
// `<QueryClientProvider client={getQueryClient()}>`, mount the devtools gated on
// `process.env.NODE_ENV !== 'production'` (dynamically imported via `next/dynamic`
// so the bundle tree-shakes), and run the `?clearCache=1` one-shot effect inside
// its own `<Suspense fallback={null}>` child (a `useSearchParams` reader, which
// `cacheComponents: true` requires sit under Suspense).
export const Providers = ({ children }: { children: ReactNode }) => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
    {children}
  </ThemeProvider>
);
