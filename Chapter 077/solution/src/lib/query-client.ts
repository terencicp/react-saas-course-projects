import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import { cache } from 'react';

export const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });

// On the server a single module-level client would be shared across every
// concurrent request, leaking one tenant's prefetched comments into another's
// render. `cache()` scopes the client to the current request, so each render
// gets its own. In the browser there is exactly one client per tab, so a module
// singleton is correct and avoids tearing the cache down on every navigation.
let browserClient: QueryClient | undefined;

export const getQueryClient = (): QueryClient => {
  if (typeof window === 'undefined') {
    return cache(makeQueryClient)();
  }
  browserClient ??= makeQueryClient();
  return browserClient;
};
