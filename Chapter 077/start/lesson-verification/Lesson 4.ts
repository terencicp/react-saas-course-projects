import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Read a project source file relative to this lesson-verification folder. Used
// only for the optimistic cache transform that lives inside `comment-thread.tsx`'s
// `useMutation` callbacks (cancel → snapshot → page-0 prepend → restore → settle).
// Those closures run only inside a live, mounted component reacting to a real
// `.mutate()`; this is a node-env suite with no DOM (no jsdom / test-renderer /
// testing-library), so `renderToStaticMarkup` can never reach them — it produces
// first paint, never an interaction. For that ordering we assert the load-bearing
// source shape, the runner's sanctioned fallback for non-renderable wiring (the
// same fallback Lesson 3 used for `maxPages` and the error state). Everything that
// *is* drivable in node — the Server Action write seam — is exercised for real.
// Strip line and block comments before matching: the start files carry TODO
// comments that spell out the exact wiring verbatim, so a raw `includes` would
// match the instructions, not the student's code. We assert against code only.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const readSource = (rel: string): string =>
  stripComments(
    readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8'),
  );

const THREAD_SRC = 'src/app/(app)/invoices/[id]/comment-thread.tsx';

// `actions.ts` → `authed-action.ts` / `force-failure.ts` / `store.ts` open with
// `import 'server-only'`, which has no node build and throws on import. Stub it so
// the write seam loads in this node-env test exactly as it would in an RSC bundle.
vi.mock('server-only', () => ({}));

// The action calls `updateTag(invoiceCommentsTag(...))` to invalidate the Server
// Component cache. `updateTag` needs a Next request/cache scope that does not
// exist in a plain node test; stub it to a no-op so the in-store write and the
// returned Result — the behavior under test — run without a framework context.
vi.mock('next/cache', () => ({
  updateTag: async () => {},
  revalidateTag: () => {},
}));

// The action resolves the dev session through `cookies()` from `next/headers`.
// There is no request-scoped cookie store in a node test, so we return no
// `acting-identity` cookie — the session resolver then defaults to the seeded
// `org-acme:admin`, the identity all four requirements here exercise.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// --- Write-seam driver -------------------------------------------------------

// `addCommentAction` is the direct-input twin: it takes a plain object and
// returns a `Result`, exactly the shape `useMutation`'s `mutationFn` awaits. Call
// it as the mutation would — no FormData, no React.
type AddResult =
  | { ok: true; data: { id: string; createdAt: string } }
  | { ok: false; error: { code: string; userMessage: string } };

const post = async (input: {
  invoiceId: string;
  body: string;
}): Promise<AddResult> => {
  const { addCommentAction } = await import('@/lib/comments/actions');
  return (await addCommentAction(input)) as AddResult;
};

// Snapshot the comment + audit row counts for an invoice straight off the store,
// so a test can prove a forced-failure submit left both tails untouched.
const storeCounts = async (invoiceId: string) => {
  const { invoiceComments, auditLogs } = await import('@/server/store');
  return {
    comments: invoiceComments.filter((c) => c.invoiceId === invoiceId).length,
    audits: auditLogs.filter(
      (a) => a.action === 'comment.added' && a.subjectId !== undefined,
    ).length,
  };
};

// =============================================================================
// Requirement 1 — submitting prepends the row synchronously, then clears the form
// =============================================================================
// The optimistic prepend and the form-clear live inside the component's mutation
// callbacks; node cannot fire a real `.mutate()`, so the observable transform is
// asserted at its load-bearing source shape (cancel-first → page-0 prepend of an
// `optimistic-` row → clear on success).
describe('Requirement 1 — the new comment appears at the top instantly and the form clears', () => {
  it('prepends an optimistic row to page 0 before the server responds, after cancelling in-flight reads', () => {
    const src = readSource(THREAD_SRC);

    expect(
      /cancelQueries/.test(src),
      'The mutation does not cancel in-flight reads before writing the optimistic row. onMutate must call queryClient.cancelQueries({ queryKey: commentKeys.lists(invoiceId) }) FIRST — otherwise a poll resolving mid-flight overwrites the optimistic row with data the server does not yet know about.',
    ).toBe(true);

    expect(
      /optimistic-/.test(src) && /randomUUID/.test(src),
      'The optimistic row has no temporary id. onMutate must build a Comment with an "optimistic-" + crypto.randomUUID() id so the new comment renders at the top synchronously, before the action returns, and can be swapped for the server row on settle.',
    ).toBe(true);

    expect(
      /setQueryData/.test(src) && /onMutate/.test(src),
      'onMutate does not write the optimistic row into the cache. It must setQueryData the infinite-query under commentKeys.lists(invoiceId), prepending the new row into pages[0].comments so it paints at the head immediately.',
    ).toBe(true);

    expect(
      /onSuccess/.test(src) && /setBody\(\s*['"]['"]\s*\)/.test(src),
      'The form is not cleared after a successful post. onSuccess must reset the body state (setBody("")) so the textarea empties once the comment lands.',
    ).toBe(true);
  });
});

// =============================================================================
// Requirement 2 — the optimistic row settles into the canonical server row
// =============================================================================
// The id-swap is: the action returns the real store id, then onSettled's
// invalidateQueries refetches the canonical row, replacing the `optimistic-<uuid>`
// placeholder. The server half (a real store id, distinct from any optimistic id)
// is driven live; the client refetch wiring is asserted at the source.
describe('Requirement 2 — the optimistic row is replaced by the canonical server row', () => {
  it('the action persists the comment and returns a server-generated store id (not an optimistic id)', async () => {
    const before = await storeCounts('inv-0001');

    const result = await post({ invoiceId: 'inv-0001', body: 'Looks good.' });

    expect(
      result.ok,
      'The write seam refused a valid in-org post. addCommentAction("member", ...) should resolve the default org-acme:admin session, pass the role gate, persist the comment, and return ok:true — a still-stubbed action returns { ok:false, error:{ code:"internal" } }.',
    ).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(
      typeof result.data.id === 'string' && result.data.id.length > 0,
      'The action did not return a server-generated id. It must echo pushComment(...)’s row id back as { id, createdAt } so the mutation can swap the optimistic placeholder for the canonical row.',
    ).toBe(true);

    expect(
      result.data.id.startsWith('optimistic-'),
      'The returned id carries the optimistic- prefix. The canonical id comes from the store (pushComment), never from the client’s temporary `optimistic-<uuid>` — the swap exists precisely to replace that placeholder with a real id.',
    ).toBe(false);

    const after = await storeCounts('inv-0001');
    expect(
      after.comments,
      'A successful post did not add a comment row to the store. The action must pushComment so the next refetch returns the canonical row.',
    ).toBe(before.comments + 1);
  });

  it('settles by invalidating the client cache so the canonical row replaces the placeholder', () => {
    const src = readSource(THREAD_SRC);

    expect(
      /onSettled/.test(src) && /invalidateQueries/.test(src),
      'onSettled does not invalidate the client query. invalidateQueries({ queryKey: commentKeys.lists(invoiceId) }) in onSettled is what refetches the canonical row and flips the optimistic-<uuid> placeholder to its real server id; without it the placeholder lingers until the next poll.',
    ).toBe(true);
  });
});

// =============================================================================
// Requirement 3 — a forced server reject rolls back exactly, with a clean tail
// =============================================================================
describe('Requirement 3 — a rejected submit rolls back to the snapshot, banner shows, tail unchanged', () => {
  it('a force-failed post writes no comment and no audit row, and returns an error Result', async () => {
    const { armForceFailure } = await import('@/lib/comments/force-failure');
    const { findUser } = await import('@/server/store');

    // Arm the inspector's one-shot force-500 for the acting user (default
    // org-acme:admin), exactly as the inspector control does, then submit.
    const session = await import('@/server/session').then((m) =>
      m.getSession(),
    );
    armForceFailure(session.userId);
    // Confirm the fixture resolved a real acting user so the flag targets the
    // same id the action consumes.
    expect(
      findUser(session.userId),
      'The acting session did not resolve to a seeded user; the force-failure flag could not be armed against the actor.',
    ).toBeTruthy();

    const before = await storeCounts('inv-0001');

    const result = await post({
      invoiceId: 'inv-0001',
      body: 'This one should be rejected.',
    });

    expect(
      result.ok,
      'A force-failed post still succeeded. consumeForceFailure(ctx.userId) must run FIRST and short-circuit with an error Result when armed, so the optimistic row can roll back.',
    ).toBe(false);

    const after = await storeCounts('inv-0001');
    expect(
      after.comments,
      'A force-failed post still wrote a comment row. The force-failure check must return BEFORE pushComment — the rejection has to leave the store exactly as it was so onError can restore the snapshot cleanly.',
    ).toBe(before.comments);

    expect(
      after.audits,
      'A force-failed post still wrote a comment.added audit row. The early return must come before pushAudit, so a forced failure leaves the audit tail untouched.',
    ).toBe(before.audits);
  });

  it('restores the exact pre-mutation snapshot and surfaces the error on rollback', () => {
    const src = readSource(THREAD_SRC);

    expect(
      /onError/.test(src) && /setQueryData/.test(src) && /snapshot/.test(src),
      'onError does not restore the snapshot. onMutate must capture the whole InfiniteData via getQueryData and return it; onError must setQueryData it back so the thread returns to its exact pre-submit state — the optimistic row vanishes and no rows are lost.',
    ).toBe(true);

    expect(
      /getQueryData/.test(src),
      'The snapshot is not taken from the cache. onMutate must getQueryData the entire InfiniteData (all pages), not just page 0, so a restore covers any reshaping that happened between the write and the error.',
    ).toBe(true);
  });

  it('the post form surfaces the rejection in a visible error banner', () => {
    const src = readSource('src/app/(app)/invoices/[id]/comment-form.tsx');

    expect(
      src.includes('data-testid="post-error"'),
      'The form has no data-testid="post-error" element. A rejected post must surface the error message in an inline banner — the form takes an `error` prop and renders it when present.',
    ).toBe(true);
  });
});

// =============================================================================
// Requirement 5 — a coworker insert mid-submit does not duplicate once settled
// =============================================================================
// On settle, invalidateQueries refetches the canonical first page from the store.
// The newly inserted coworker row and the just-posted row both arrive as real
// store rows; the optimistic placeholder is dropped (it never matched a store id).
// The store/read seam is driven for real to prove the settled page carries each
// distinct row exactly once.
describe('Requirement 5 — a coworker comment arriving mid-submit produces no duplicate', () => {
  it('the post and a concurrent coworker insert both surface as distinct canonical rows on the next read', async () => {
    const { insertCoworkerComment, listCommentsPage } = await import(
      '@/server/store'
    );

    // The user posts a comment (the optimistic add would prepend a placeholder)…
    const posted = await post({
      invoiceId: 'inv-0001',
      body: 'My own comment in flight.',
    });
    expect(
      posted.ok,
      'The post that should settle into a canonical row failed; cannot test the no-duplicate settle.',
    ).toBe(true);
    if (!posted.ok) {
      return;
    }

    // …and mid-flight a coworker's comment lands (the inspector control).
    const coworker = insertCoworkerComment('org-acme', 'inv-0001');
    expect(
      coworker,
      'insertCoworkerComment did not return a row — the fixture could not stage a concurrent insert.',
    ).toBeTruthy();

    // The settle refetch reads the head page through the store, exactly as
    // invalidateQueries → fetchCommentsPage → listCommentsPage would.
    const page = listCommentsPage({
      orgId: 'org-acme',
      invoiceId: 'inv-0001',
      cursor: null,
      pageSize: 20,
    });

    const ids = page.comments.map((c) => c.id);

    expect(
      ids.some((id) => id.startsWith('optimistic-')),
      'The settled page still carries an optimistic- placeholder. After invalidateQueries refetches, the cache is rebuilt from server rows — the optimistic id must not survive into the canonical page, or the user sees their comment twice.',
    ).toBe(false);

    const unique = new Set(ids);
    expect(
      unique.size,
      'The refetched head page contains a duplicate row id. The canonical rows (the user’s post and the coworker’s insert) must each appear exactly once — invalidation replaces the optimistic placeholder rather than stacking another copy on top of it.',
    ).toBe(ids.length);

    expect(
      ids.includes(posted.data.id),
      'The user’s own posted comment is missing from the settled head page. The canonical store id returned by the action must lead the thread once the refetch lands.',
    ).toBe(true);

    if (coworker) {
      expect(
        ids.includes(coworker.id),
        'The coworker’s mid-flight comment is missing from the settled head page. The settle refetch reads the live store, so a concurrent insert must surface — without dropping or duplicating the user’s own row.',
      ).toBe(true);
    }
  });
});
