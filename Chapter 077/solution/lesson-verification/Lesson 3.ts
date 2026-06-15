import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Read a project source file relative to this lesson-verification folder. Used
// only where the constraint is not observable in a node/no-DOM render: the
// `maxPages` cap is applied by React Query's infinite-query machinery on a live
// `fetchNextPage`, and the thread's error element only paints after a client
// fetch settles to error — neither survives `renderToStaticMarkup`, which always
// remounts the query as `pending`/`fetching`. For these we assert the load-
// bearing source shape, the runner's sanctioned fallback for non-renderable wiring.
const readSource = (rel: string): string =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

const THREAD_SRC = 'src/app/(app)/invoices/[id]/comment-thread.tsx';

// `route.ts` → `authed-route.ts` → `session.ts` → `store.ts` open with
// `import 'server-only'`, which has no node build and throws on import. Stub it
// so the read seam loads in this node-env test exactly as it would in an RSC /
// route-handler bundle.
vi.mock('server-only', () => ({}));

// The route handler resolves the dev session through `cookies()` from
// `next/headers`. There is no request-scoped cookie store in a node test, so we
// drive the acting identity directly: `actAs(value)` sets the cookie the same
// `'<orgId>:<role>'` shape the inspector's identity switcher writes, and the
// session resolver maps it to a seeded user. Absent/unknown → `org-acme:admin`.
let actingIdentity: string | undefined;
const actAs = (value: string | undefined) => {
  actingIdentity = value;
};
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'acting-identity' && actingIdentity !== undefined
        ? { value: actingIdentity }
        : undefined,
  }),
}));

beforeEach(() => {
  actingIdentity = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// --- Route-handler driver ----------------------------------------------------

// `authedRoute` only reads `request.url` (it does `new URL(request.url)` and
// pulls `searchParams`), so a plain object with a `url` string stands in for a
// NextRequest with no need to import `next/server`. Dynamic params arrive as a
// Promise on the second arg in Next 16.
const ORIGIN = 'http://localhost:3000';
const callGet = async (args: {
  invoiceId: string;
  cursor?: string;
}): Promise<Response> => {
  const mod = await import('@/app/api/invoices/[id]/comments/route');
  const url = new URL(`${ORIGIN}/api/invoices/${args.invoiceId}/comments`);
  if (args.cursor) {
    url.searchParams.set('cursor', args.cursor);
  }
  const request = { url: url.toString(), method: 'GET' };
  const context = { params: Promise.resolve({ id: args.invoiceId }) };
  // The handler's arity differs between the stubbed start (0 args) and the wired
  // solution (request, context); call through a loose reference so the test
  // typechecks against both. The behavior under test is the response body.
  const GET = mod.GET as unknown as (
    req: unknown,
    ctx: unknown,
  ) => Promise<Response>;
  return GET(request, context);
};

// --- Client-fetcher driver ---------------------------------------------------

// The fetcher reads `window.location.origin` and calls the global `fetch`.
// Stub both, capturing the requested URL so we can assert the GET shape, and
// returning whatever page body the test wants the seam to yield.
const runFetcher = async (args: {
  invoiceId: string;
  cursor: string | null;
  responseBody: unknown;
  ok?: boolean;
  status?: number;
}): Promise<{ result: unknown; calledUrl: string | null }> => {
  const { fetchCommentsPage } = await import('@/lib/comments/fetcher');

  let calledUrl: string | null = null;
  // `vi.stubGlobal` swaps the global and restores it on `vi.restoreAllMocks`,
  // so the fetcher reads `window.location.origin` and the global `fetch` we
  // control without hand-managing (and colliding with) the DOM `Window` type.
  vi.stubGlobal('window', { location: { origin: ORIGIN } });
  vi.stubGlobal('fetch', async (input: URL | string) => {
    calledUrl = input.toString();
    return {
      ok: args.ok ?? true,
      status: args.status ?? 200,
      json: async () => ({ data: args.responseBody }),
    } as Response;
  });

  const result = await fetchCommentsPage({
    invoiceId: args.invoiceId,
    cursor: args.cursor,
  });
  return { result, calledUrl };
};

// --- Thread render driver ----------------------------------------------------

const commentRowCount = (html: string): number =>
  (html.match(/data-comment-id=/g) ?? []).length;

// Render the client thread leaf over a hydrated cache holding `pageCount` pages,
// exactly as the page's SSR prefetch would seed it. The client `useInfiniteQuery`
// reads this hydrated state without firing the fetcher, so the static markup
// reflects the thread's render shape: which pages are retained (the `maxPages`
// cap), the head's rows, and the "Load older" / "End of thread" control state.
const renderThreadOverCache = async (args: {
  invoiceId: string;
  pageCount: number;
  pageSize?: number;
  exhaust?: boolean;
}): Promise<string> => {
  const { dehydrate, HydrationBoundary, QueryClient, QueryClientProvider } =
    await import('@tanstack/react-query');
  const { commentKeys } = await import('@/lib/comments/keys');
  const { CommentThread } = await import(
    '@/app/(app)/invoices/[id]/comment-thread'
  );

  const pageSize = args.pageSize ?? 20;

  // Synthetic pages so the test controls page count without depending on the
  // store's seed size. Each page carries `pageSize` rows with stable ids; the
  // last page's `nextCursor` is null only when `exhaust` is set (no older page).
  let rowSeq = 0;
  const makePage = (pageIndex: number, isLast: boolean) => {
    const comments = Array.from({ length: pageSize }, () => {
      const n = rowSeq++;
      return {
        id: `cmt-${args.invoiceId}-${String(n).padStart(4, '0')}`,
        invoiceId: args.invoiceId,
        authorId: 'user-acme-admin',
        authorName: 'Ada Acme',
        body: `Seeded comment body number ${n}.`,
        createdAt: new Date(
          Date.parse('2026-05-01T12:00:00.000Z') - n * 60_000,
        ).toISOString(),
      };
    });
    return {
      comments,
      nextCursor: isLast && args.exhaust ? null : `cursor-${pageIndex + 1}`,
      prevCursor: `cursor-prev-${pageIndex}`,
    };
  };

  const pages = Array.from({ length: args.pageCount }, (_, i) =>
    makePage(i, i === args.pageCount - 1),
  );
  const pageParams = pages.map((_, i) => (i === 0 ? null : `cursor-${i}`));

  const client = new QueryClient();
  // Seed the infinite-query cache directly with the constructed pages. The
  // client hook reads this hydrated state; `maxPages` is applied by the hook.
  client.setQueryData(commentKeys.lists(args.invoiceId), {
    pages,
    pageParams,
  });

  const state = dehydrate(client);
  const browser = new QueryClient();

  const tree: ReactNode = createElement(
    QueryClientProvider,
    { client: browser },
    createElement(
      HydrationBoundary,
      { state },
      createElement(CommentThread, {
        invoiceId: args.invoiceId,
        session: { userId: 'user-acme-admin', userName: 'Ada Acme' },
      }),
    ),
  );

  return renderToStaticMarkup(tree);
};

// =============================================================================
// Requirement 1 — "Load older" appends the next earlier page below the head
// =============================================================================
describe('Requirement 1 — "Load older" appends earlier pages below the head', () => {
  it('renders every retained page top-to-bottom, head first', async () => {
    const onePage = await renderThreadOverCache({
      invoiceId: 'inv-0001',
      pageCount: 1,
    });
    const threePages = await renderThreadOverCache({
      invoiceId: 'inv-0001',
      pageCount: 3,
    });

    expect(
      commentRowCount(onePage),
      'The thread rendered the wrong number of rows for a single hydrated page. It must render data?.pages.flatMap(p => p.comments) — every comment of every retained page — so a single 20-row page shows 20 rows.',
    ).toBe(20);

    expect(
      commentRowCount(threePages),
      'After three pages are loaded the thread did not render all three. "Load older" appends each new page to data.pages; the render flattens every page, so three 20-row pages must show 60 rows with the head still on top.',
    ).toBe(60);

    // The head page's first row (rowSeq 0) renders before the appended pages'
    // rows: the already-loaded head stays in place, older pages land below it.
    expect(
      threePages.indexOf('cmt-inv-0001-0000') <
        threePages.indexOf('cmt-inv-0001-0020'),
      'The head page did not stay above the appended older pages. The render order must be page 0 (newest) first, with each "Load older" page appended below — the existing head must not be reordered or refetched.',
    ).toBe(true);
  });
});

// =============================================================================
// Requirement 2 — repeated "Load older" until exhausted shows end-of-thread
// =============================================================================
describe('Requirement 2 — the control shows an end-of-thread state when the thread runs out', () => {
  it('offers "Load older" while pages remain and switches to "End of thread" when exhausted', async () => {
    const more = await renderThreadOverCache({
      invoiceId: 'inv-0001',
      pageCount: 2,
      exhaust: false,
    });
    const exhausted = await renderThreadOverCache({
      invoiceId: 'inv-0001',
      pageCount: 2,
      exhaust: true,
    });

    expect(
      more.includes('data-testid="load-older"'),
      'The "Load older" control (data-testid="load-older") is missing. The thread must render a button the user clicks to page in earlier comments.',
    ).toBe(true);

    expect(
      more.includes('Load older'),
      'While the last page still has a nextCursor, the control must read "Load older" (hasNextPage is true) — it showed the end state too early.',
    ).toBe(true);

    expect(
      exhausted.includes('End of thread'),
      'When the last page\'s nextCursor is null (getNextPageParam returns undefined → hasNextPage false), the control must show an "End of thread" state instead of "Load older".',
    ).toBe(true);

    expect(
      exhausted.includes('Load older'),
      'The control still offered "Load older" after the thread was exhausted. Once hasNextPage is false it must stop inviting more pages.',
    ).toBe(false);
  });
});

// =============================================================================
// Requirement 3 — retained pages capped at ten (bounded memory)
// =============================================================================
// React Query applies `maxPages` inside its infinite-query behavior when a live
// `fetchNextPage` resolves — there is no node/no-DOM observable for it (a static
// render of a pre-seeded 12-page cache is not a real paging event, so the cap
// never fires). The load-bearing wiring is the `maxPages: 10` option; assert it
// at the source, then confirm the matching `getPreviousPageParam` it requires.
describe('Requirement 3 — retained pages stay capped at ten', () => {
  it('the thread bounds its retained pages with maxPages: 10', () => {
    const src = readSource(THREAD_SRC);

    expect(
      /maxPages\s*:\s*10\b/.test(src),
      'The thread does not cap retained pages at ten. useInfiniteQuery must set maxPages: 10 so deep scroll-back drops the oldest retained page instead of growing the cache without bound (a chat-style thread, unlike a read-once feed).',
    ).toBe(true);

    expect(
      /getPreviousPageParam\s*:/.test(src),
      'maxPages is set but getPreviousPageParam is missing. Whenever maxPages caps the window, a backward cursor is mandatory so a page dropped by the cap can re-fetch on scroll-back — without it, scrolling back up after the cap drops a page leaves a hole.',
    ).toBe(true);
  });
});

// =============================================================================
// Requirement 4 — a coworker's comment surfaces at the head on the next read
// =============================================================================
describe('Requirement 4 — an inserted coworker comment appears at the top of the thread', () => {
  it('the first page the read seam returns carries the newly inserted comment at its head', async () => {
    const { insertCoworkerComment } = await import('@/server/store');

    // Insert a comment from the other seeded user, as the inspector does. The
    // poll's next GET reads the head page; the new row must lead it.
    const inserted = insertCoworkerComment('org-acme', 'inv-0001');
    expect(
      inserted,
      'insertCoworkerComment did not return a row — the test fixture could not stage a coworker comment.',
    ).toBeTruthy();

    const res = await callGet({ invoiceId: 'inv-0001' });
    const json = (await res.json()) as {
      data: { comments: Array<{ id: string }> };
    };

    expect(
      json.data.comments[0]?.id,
      'The freshly inserted coworker comment did not lead the head page. The 10s poll re-reads the first page through the route handler; a newly inserted (newest) comment must sort to the very top so it appears without a manual refresh.',
    ).toBe(inserted?.id);
  });
});

// =============================================================================
// Requirement 6 — "Load older" and the poll both travel as GET /api/.../comments
// =============================================================================
describe('Requirement 6 — reads travel as GET /api/invoices/[id]/comments', () => {
  it('the client fetcher requests the route-handler URL, with the cursor as a search param', async () => {
    const body = { comments: [], nextCursor: null, prevCursor: null };

    const firstPage = await runFetcher({
      invoiceId: 'inv-0001',
      cursor: null,
      responseBody: body,
    });
    const olderPage = await runFetcher({
      invoiceId: 'inv-0001',
      cursor: 'cursor-abc',
      responseBody: body,
    });

    expect(
      firstPage.calledUrl,
      'The client fetcher did not request the route handler. Both the poll and "Load older" must travel as GET /api/invoices/<id>/comments through the public seam — the fetcher should build that URL against window.location.origin and fetch it.',
    ).toBe(`${ORIGIN}/api/invoices/inv-0001/comments`);

    expect(
      olderPage.calledUrl,
      'A cursor-paged "Load older" request did not carry the cursor. The fetcher must set the cursor as a ?cursor= search param so the handler reads the next page; without it every page repeats the head.',
    ).toBe(`${ORIGIN}/api/invoices/inv-0001/comments?cursor=cursor-abc`);
  });

  it('the route handler answers the GET with the page envelope', async () => {
    const res = await callGet({ invoiceId: 'inv-0001' });
    const json = (await res.json()) as {
      data: { comments: unknown[]; nextCursor: string | null };
    };

    expect(
      res.status,
      'A GET to the read seam for an in-org invoice did not return 200. The authedRoute("member", ...) handler should resolve the default org-acme:admin session, pass the role gate, and answer with the page.',
    ).toBe(200);

    expect(
      Array.isArray(json.data?.comments) && json.data.comments.length === 20,
      'The read seam did not return a full first page of 20 comments. The handler must call listCommentsPage({ orgId: ctx.orgId, invoiceId: ctx.params.id, cursor, pageSize: 20 }) and return { data } — a static empty response means the handler is still stubbed.',
    ).toBe(true);
  });
});

// =============================================================================
// Requirement 7 — cross-org / sub-member reads are rejected before any data
// =============================================================================
describe('Requirement 7 — the read seam enforces the tenancy boundary', () => {
  it('scopes the read to the acting org: globex sees its thread, acme sees an empty page for it', async () => {
    // The same globex invoiceId, read under two identities. Acting as globex it
    // returns the seeded thread; acting as acme it returns an empty page — the
    // read is scoped to ctx.orgId, not to the invoiceId alone. A static stub
    // returns the same empty body for both and fails the first assertion.
    actAs('org-globex:admin');
    const owner = await callGet({ invoiceId: 'glx-0001' });
    const ownerJson = (await owner.json()) as { data: { comments: unknown[] } };

    actAs('org-acme:admin');
    const foreign = await callGet({ invoiceId: 'glx-0001' });
    const foreignJson = (await foreign.json()) as {
      data: { comments: unknown[] };
    };

    expect(
      ownerJson.data?.comments?.length,
      "The owning org (globex) read its own focal invoice but got an empty page. Scoping to ctx.orgId must still return the tenant's own thread — an empty body means the handler is still the static stub, not the real scoped read.",
    ).toBe(20);

    expect(
      foreign.status,
      'A cross-org read did not return 200 with an empty page. The handler should still answer (the member role passes), but scope the read to ctx.orgId so no foreign rows are found.',
    ).toBe(200);

    expect(
      foreignJson.data?.comments?.length,
      "An invoice from another org leaked its comments. The handler must scope listCommentsPage to ctx.orgId — a foreign invoiceId then matches no rows for the acting org and returns an empty page, never another tenant's thread.",
    ).toBe(0);
  });

  it('admits a member-level caller and runs the scoped read', async () => {
    // The seeded identities are all member-or-above, so the 403 sub-member
    // branch is exercised by the manual checklist. What we can assert in-runner
    // is the other half of the same authedRoute gate: a `member` is admitted and
    // the read actually runs (a populated in-org page), not the static stub's
    // empty body. A still-stubbed handler returns an empty page here and fails.
    actAs('org-acme:member');
    const res = await callGet({ invoiceId: 'inv-0001' });
    const json = (await res.json()) as { data: { comments: unknown[] } };

    expect(
      res.status,
      'A member-level caller was refused. authedRoute("member", ...) must admit member and above — the role gate is too strict if a member cannot read.',
    ).toBe(200);

    expect(
      json.data?.comments?.length,
      'A member read an in-org invoice but got an empty page. Once admitted by the role gate, the handler must run listCommentsPage scoped to ctx.orgId and return the real first page — an empty body means the handler is still the static stub.',
    ).toBe(20);
  });
});

// =============================================================================
// Requirement 8 — a drifted response surfaces as a visible thread error
// =============================================================================
describe('Requirement 8 — a drifted response surfaces a visible error, not a silent render', () => {
  it('accepts a well-formed page but rejects one carrying an unexpected field', async () => {
    // The well-formed page must resolve — otherwise "rejects on drift" would
    // pass for an unconditionally-throwing stub. The contrast is the real test:
    // a strictObject parse accepts the clean body and throws on the phantom key.
    const clean = await runFetcher({
      invoiceId: 'inv-0001',
      cursor: null,
      responseBody: { comments: [], nextCursor: null, prevCursor: null },
    });
    expect(
      clean.result,
      'A well-formed page did not parse through the fetcher. fetchCommentsPage must fetch the seam, then return commentsPageSchema.parse(json.data) — a still-throwing stub fails here, before any drift handling matters.',
    ).toEqual({ comments: [], nextCursor: null, prevCursor: null });

    await expect(
      runFetcher({
        invoiceId: 'inv-0001',
        cursor: null,
        // A phantom field the strict schema does not allow.
        responseBody: {
          comments: [],
          nextCursor: null,
          prevCursor: null,
          phantom: true,
        },
      }),
      'A drifted response (an unexpected field) was accepted silently. The fetcher must parse the body through commentsPageSchema (a strictObject), so an extra key throws — that rejection is what flips the query to an error state instead of rendering bad data.',
    ).rejects.toThrow();
  });

  it('throws on a non-ok response so the query surfaces the failure', async () => {
    await expect(
      runFetcher({
        invoiceId: 'inv-0001',
        cursor: null,
        responseBody: { comments: [], nextCursor: null, prevCursor: null },
        ok: false,
        status: 500,
      }),
      'The fetcher resolved on a non-ok (500) response. It must check !res.ok and throw so useInfiniteQuery enters its error state and the thread can render data-testid="thread-error" instead of an empty success.',
    ).rejects.toThrow();
  });

  // The fetcher rejecting (above) is what flips useInfiniteQuery to its error
  // state; the visible `thread-error` element only paints after that client
  // fetch settles, which a static `renderToStaticMarkup` cannot reach (it
  // remounts the query as `pending`/`fetching`). Assert the wiring at the
  // source: a `thread-error` element gated on the query's error flag.
  it('the thread surfaces a visible error element wired to the query error state', () => {
    const src = readSource(THREAD_SRC);

    expect(
      src.includes('data-testid="thread-error"'),
      'The thread has no data-testid="thread-error" element. A drifted or failed read must surface a visible error in the thread rather than rendering an empty list silently.',
    ).toBe(true);

    expect(
      /\bisError\b/.test(src),
      "The thread does not read useInfiniteQuery's isError. The thread-error element must be gated on the query's error flag so a rejected fetch (drift or non-ok) shows the error, and a successful refetch clears it.",
    ).toBe(true);
  });
});
