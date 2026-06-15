import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The server read layer (`queries.ts` → `store.ts`) opens with `import
// 'server-only'`, which has no node build and throws on import. Stub it so the
// in-process prefetch path loads in this node-env test exactly as it would
// inside an RSC bundle.
vi.mock('server-only', () => ({}));

afterEach(() => {
  vi.restoreAllMocks();
});

// One of the seeded comment bodies on each org's focal invoice. Its presence in
// the rendered static markup is the "painted on first render, from the cache the
// server populated" observable — no client fetch is needed to make it appear.
const SEEDED_BODY = 'Confirmed the totals with the customer on the phone.';

// Reproduce, in-process, exactly what the invoice detail page does to bridge the
// server cache to the client: obtain a server QueryClient, prefetch the thread's
// first page under the shared key via the server-only read, dehydrate, then
// render the client thread leaf inside a <HydrationBoundary> carrying that
// state. A real <QueryClientProvider> stands in for the root <Providers> so the
// thread's useQueryClient() has a client. We never import the page module
// itself — it reaches for cookies()/notFound(), request-time machinery this
// node test has no business standing up. The bridge is the observable.
//
// `onClientFetch` is wired into the thread's queryFn so the test can assert that
// no client fetch fired on first paint: if the prefetch key matches the hook
// key, the hydrated data is already `success` and the queryFn is never called.
const renderThread = async (args: {
  orgId: string;
  invoiceId: string;
  userId: string;
  userName: string;
  onClientFetch?: () => void;
}): Promise<string> => {
  const { dehydrate, HydrationBoundary, QueryClient, QueryClientProvider } =
    await import('@tanstack/react-query');
  const { getQueryClient } = await import('@/lib/query-client');
  const { commentKeys } = await import('@/lib/comments/keys');
  const { listCommentsPage } = await import('@/lib/comments/queries');
  const { CommentThread } = await import(
    '@/app/(app)/invoices/[id]/comment-thread'
  );

  // The client fetcher must NOT run on first paint. Spy on it so a fetch firing
  // (the symptom of a hydration miss) is observable rather than silent.
  if (args.onClientFetch) {
    const fetcher = await import('@/lib/comments/fetcher');
    vi.spyOn(fetcher, 'fetchCommentsPage').mockImplementation(async () => {
      args.onClientFetch?.();
      return { comments: [], nextCursor: null, prevCursor: null };
    });
  }

  const server = getQueryClient();
  await server.prefetchInfiniteQuery({
    queryKey: commentKeys.lists(args.invoiceId),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listCommentsPage({
        orgId: args.orgId,
        invoiceId: args.invoiceId,
        cursor: pageParam,
        pageSize: 20,
      }),
    initialPageParam: null as string | null,
  });

  const state = dehydrate(server);
  const browser = new QueryClient();

  const tree: ReactNode = createElement(
    QueryClientProvider,
    { client: browser },
    createElement(
      HydrationBoundary,
      { state },
      createElement(CommentThread, {
        invoiceId: args.invoiceId,
        session: { userId: args.userId, userName: args.userName },
      }),
    ),
  );

  return renderToStaticMarkup(tree);
};

const commentRowCount = (html: string): number =>
  (html.match(/data-comment-id=/g) ?? []).length;

describe('Requirement 1 — the seeded thread paints on first render, no client fetch', () => {
  it('renders the first page of seeded comments synchronously, with no fetcher call', async () => {
    let clientFetches = 0;
    const html = await renderThread({
      orgId: 'org-acme',
      invoiceId: 'inv-0001',
      userId: 'user-acme-admin',
      userName: 'Ada Acme',
      onClientFetch: () => {
        clientFetches += 1;
      },
    });

    expect(
      commentRowCount(html),
      'The thread rendered zero comment rows on first paint. The page must seed the cache with prefetchInfiniteQuery(commentKeys.lists(id), listCommentsPage) and wrap the thread in <HydrationBoundary state={dehydrate(queryClient)}>; the client useInfiniteQuery then reads that hydrated first page instead of an empty/loading state.',
    ).toBe(20);

    expect(
      html.includes(SEEDED_BODY),
      'A known seeded comment body is missing from the first paint. The thread should render data?.pages.flatMap(p => p.comments) from the hydrated cache — if it shows a "not wired" stub or an empty list, the useInfiniteQuery / hydration wiring is not in place.',
    ).toBe(true);

    expect(
      clientFetches,
      'The client fetcher fired on first paint. With the prefetch key matching the hook key, the hydrated query is already `success`, so the queryFn must never run on initial render — a fetch firing means the hydrated cache was missed.',
    ).toBe(0);
  });
});

describe('Requirement 2 — the dehydrated cache ships in the rendered markup', () => {
  it('comment bodies are present in the raw static markup, not fetched after hydration', async () => {
    const html = await renderThread({
      orgId: 'org-acme',
      invoiceId: 'inv-0001',
      userId: 'user-acme-admin',
      userName: 'Ada Acme',
    });

    expect(
      html.includes(SEEDED_BODY),
      'The seeded comment body is absent from the server-rendered HTML. The dehydrated cache (dehydrate(queryClient)) must travel in the payload so the thread paints from it — if the body only appears after a client fetch, the prefetch/dehydrate step is missing.',
    ).toBe(true);

    expect(
      html.includes('Ada Acme'),
      'The comment author name is missing from the rendered markup. Each hydrated row should render its authorName/body, proving the full first page rode along in the dehydrated state rather than being lazily fetched.',
    ).toBe(true);
  });
});

describe('Requirement 3 — the cache is rebuilt per request; first paint is reproducible', () => {
  it('two independent prefetch + render cycles each reproduce the full thread', async () => {
    const first = await renderThread({
      orgId: 'org-acme',
      invoiceId: 'inv-0001',
      userId: 'user-acme-admin',
      userName: 'Ada Acme',
    });
    const second = await renderThread({
      orgId: 'org-acme',
      invoiceId: 'inv-0001',
      userId: 'user-acme-admin',
      userName: 'Ada Acme',
    });

    expect(
      commentRowCount(first),
      'The first request did not paint the full first page. Each request must obtain its own server QueryClient via getQueryClient() and prefetch fresh — a hard refresh should always land the instant first paint.',
    ).toBe(20);

    expect(
      commentRowCount(second),
      'A second independent request did not reproduce the full first paint. The per-request server client must rebuild the cache from scratch every time; the second render depending on the first means the client is not request-scoped.',
    ).toBe(commentRowCount(first));

    expect(
      second.includes(SEEDED_BODY),
      'The seeded body vanished on the second request. Rebuilding the cache per request must yield the same first paint every time, not degrade after the first hit.',
    ).toBe(true);
  });
});

describe('Requirement 4 — two orgs in quick succession see only their own comments', () => {
  it('each org render carries its own tenant rows and none of the other org', async () => {
    const acme = await renderThread({
      orgId: 'org-acme',
      invoiceId: 'inv-0001',
      userId: 'user-acme-admin',
      userName: 'Ada Acme',
    });
    const globex = await renderThread({
      orgId: 'org-globex',
      invoiceId: 'glx-0001',
      userId: 'user-globex-admin',
      userName: 'Gita Globex',
    });

    const acmeOwnRows = (acme.match(/data-comment-id="cmt-inv-0001/g) ?? [])
      .length;
    const acmeForeignRows = (acme.match(/cmt-glx-0001/g) ?? []).length;
    const globexOwnRows = (globex.match(/data-comment-id="cmt-glx-0001/g) ?? [])
      .length;
    const globexForeignRows = (globex.match(/cmt-inv-0001/g) ?? []).length;

    expect(
      acmeOwnRows,
      'The org-acme render showed none of its own comments. Each render must prefetch into its own request-scoped client keyed on its orgId.',
    ).toBeGreaterThan(0);

    expect(
      acmeForeignRows,
      "The org-acme render leaked org-globex comments. A module-scoped server QueryClient shared across requests carries the first tenant's prefetched rows into the next render — getQueryClient() must branch on typeof window and wrap the server path in cache() so each request gets a fresh client.",
    ).toBe(0);

    expect(
      globexOwnRows,
      'The org-globex render showed none of its own comments. Each render must prefetch into its own request-scoped client keyed on its orgId.',
    ).toBeGreaterThan(0);

    expect(
      globexForeignRows,
      "The org-globex render leaked org-acme comments — a cross-tenant data-isolation bug. The per-request server client (cache()-wrapped factory, branched on typeof window) is what stops one org's prefetched comments bleeding into the next org's render.",
    ).toBe(0);
  });
});
