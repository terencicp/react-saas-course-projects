import { QueryClient } from '@tanstack/react-query';

// TODO(L2) — getQueryClient() with the typeof window branch + cache()
//
// Replace this trivial single client with `makeQueryClient()` +
// `getQueryClient()`: the server path returns `cache(makeQueryClient)()` (a
// per-request React memo that stops one tenant's prefetched comments leaking
// into another's render), the browser path returns a module singleton. Do NOT
// add `import 'server-only'` — the browser branch must ship.
export const getQueryClient = (): QueryClient => new QueryClient();
