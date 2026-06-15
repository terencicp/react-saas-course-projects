'use client';

import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, Suspense, useEffect, useRef } from 'react';
import { getQueryClient } from '@/lib/query-client';

const ReactQueryDevtools =
  process.env.NODE_ENV === 'production'
    ? null
    : dynamic(() =>
        import('@tanstack/react-query-devtools').then(
          (mod) => mod.ReactQueryDevtools,
        ),
      );

// The inspector's "Clear client cache" button redirects here with
// `?clearCache=1`; this reads the flag once and wipes the browser cache.
// `useSearchParams` is an uncached request-time read, so under
// `cacheComponents: true` it must live inside a `<Suspense>` boundary or
// `next build` prerender fails — hence its own child below.
const ClearCacheOnFlag = () => {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const cleared = useRef(false);

  useEffect(() => {
    if (searchParams.get('clearCache') === '1' && !cleared.current) {
      cleared.current = true;
      queryClient.clear();
    }
  }, [searchParams, queryClient]);

  return null;
};

export const Providers = ({ children }: { children: ReactNode }) => {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <ClearCacheOnFlag />
        </Suspense>
        {children}
        {ReactQueryDevtools ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
};
