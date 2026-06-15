import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 3 — One checkpoint per page.
//
// The Trigger.dev worker runs out-of-process, so these gates never execute a real
// run against the platform. Instead they execute the student's task BODIES in-process
// by intercepting `schemaTask` at the SDK mock boundary: the mock captures each
// task's run config so the gate can call `run(payload, { ctx })` directly. Around the
// body it fakes only the platform seams the lesson is about —
//
//   • `metadata` becomes a recording store, so the per-page progress writes
//     (`pagesTotal` once, `pagesDone` each page) are observable;
//   • `idempotencyKeys.create` is a deterministic stringifier of its parts, so the
//     per-page key shape `[organizationId, 'page', String(page)]` is observable;
//   • `paginatePage.triggerAndWait(...).unwrap()` is faked with a runtime that
//     emulates Trigger.dev's idempotency dedup — a repeat call carrying a key already
//     seen returns the cached result WITHOUT re-executing the child, so cached-on-retry
//     is provable; and
//   • `AbortTaskRunError` is kept real, so the empty-org abort is checked by class.
//
// The DB + child-task modules the body imports are mocked so the real `@/db` (and its
// env boundary) never loads. The paginatePage child body is exercised separately
// against a faked `listInvoices` + a stub `rowsToCsv`, proving the one-page read and
// CSV fragment. node env, no DOM. Self-contained: every helper is inlined here.

// --- the SDK mock boundary ----------------------------------------------------------

type TaskConfig = {
  id: string;
  schema: unknown;
  run: (
    payload: unknown,
    params: { ctx: { run: { id: string } } },
  ) => Promise<unknown>;
};

// Each task's full config, captured at definition time so the gate can call its body.
const capturedTasks = new Map<string, TaskConfig>();

// metadata.set writes land here; the gate reads them back as the progress channel.
const metaStore = new Map<string, unknown>();

// Emulates the platform's per-page run: records every triggerAndWait call and, given
// an idempotencyKey, dedups a repeat (returns the cached result, no re-execution).
type PageResult = { csv: string; nextCursor: string | null; rowCount: number };
type PageCall = {
  payload: { organizationId: string; page: number; cursor: string | null };
  idempotencyKey: string | undefined;
};
const pageCalls: PageCall[] = [];
const pageCache = new Map<string, PageResult>();
let pageExecutions = 0;
// The result the child WOULD produce on a fresh execution, by page number.
let freshPageResult: (page: number) => PageResult;

const makePaginatePageStub = () => ({
  triggerAndWait: (
    payload: { organizationId: string; page: number; cursor: string | null },
    options: { idempotencyKey?: string } = {},
  ) => {
    const key = options.idempotencyKey;
    pageCalls.push({ payload, idempotencyKey: key });
    return {
      unwrap: async (): Promise<PageResult> => {
        if (key !== undefined && pageCache.has(key)) {
          // Cache hit: the platform returns the prior child result; the child body
          // does NOT run again. pageExecutions stays put.
          return pageCache.get(key) as PageResult;
        }
        pageExecutions += 1;
        const result = freshPageResult(payload.page);
        if (key !== undefined) pageCache.set(key, result);
        return result;
      },
    };
  },
});

vi.mock('server-only', () => ({}));

vi.mock('@trigger.dev/sdk/v3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@trigger.dev/sdk/v3')>();
  return {
    ...actual,
    // Capture the body instead of building a real platform task; expose only the
    // surface the parent module reads at import time (id + schema).
    schemaTask: (config: TaskConfig) => {
      capturedTasks.set(config.id, config);
      return { id: config.id, schema: config.schema };
    },
    metadata: {
      set: (key: string, value: unknown) => {
        metaStore.set(key, value);
      },
      get: (key: string) => metaStore.get(key),
    },
    // Deterministic, parts-derived key — same parts produce the same string, which is
    // what makes the dedup above fire on a parent retry. Run-scoping is the default
    // and is modelled by the parent reusing the SAME ctx.run.id across attempts.
    idempotencyKeys: {
      create: async (parts: string[]) => `idem:${parts.join('|')}`,
    },
    // AbortTaskRunError kept real (actual) so the empty-org abort is checked by class.
  };
});

// The parent body imports countInvoices; the gate drives the page count through it.
const countInvoices = vi.fn<(args: { orgId: string }) => Promise<number>>();
vi.mock('@/db/queries/invoices', () => ({
  countInvoices,
  listInvoices: vi.fn(),
}));

// The lesson-4 close-out seams: present so the body's import + later lines load, but
// inert here (this lesson does not assert them).
vi.mock('@/db/audit-log', () => ({ logAudit: vi.fn() }));
vi.mock('@/db/tenant', () => ({
  tenantDb: () => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ update: () => ({ set: () => ({ where: async () => undefined }) }) }),
  }),
}));

// Block the child task modules' real @/db (env) chain. The paginatePage stub is the
// platform seam the parent calls; the email child is inert (lesson 4).
vi.mock('../../trigger/paginate-page', () => ({
  paginatePage: makePaginatePageStub(),
}));
vi.mock('../../trigger/send-export-email', () => ({
  sendExportEmail: {
    triggerAndWait: () => ({
      unwrap: async () => ({ ok: true, data: { id: 'email_1' } }),
    }),
  },
}));

// Loads the parent module fresh, then hands back its captured run body.
const loadParentBody = async (): Promise<TaskConfig['run']> => {
  await import('../../trigger/export-invoices');
  const cfg = capturedTasks.get('export-invoices');
  if (!cfg) {
    throw new Error(
      'export-invoices task was not defined via schemaTask — the parent module did not register the task the gate runs',
    );
  }
  return cfg.run;
};

// A header-only CSV fragment stand-in, so the gate need not reproduce rowsToCsv.
const fakeCsvFor = (page: number): string => `page-${page}-csv`;

beforeEach(() => {
  capturedTasks.clear();
  metaStore.clear();
  pageCalls.length = 0;
  pageCache.clear();
  pageExecutions = 0;
  freshPageResult = (page) => ({
    csv: fakeCsvFor(page),
    nextCursor: null,
    rowCount: 100,
  });
  countInvoices.mockReset();
  vi.resetModules();
});

// Requirement 2 — per-page progress advances through run.metadata: pagesTotal is set
// once from the count, pagesDone is incremented per page, reflecting real advancement.
describe('Requirement 2 — metadata drives real per-page progress', () => {
  it('sets pagesTotal once from the count and advances pagesDone per page', async () => {
    // 600 rows / PAGE_SIZE 500 ⇒ 2 pages. The cursor carries page 0 → page 1.
    countInvoices.mockResolvedValue(600);
    freshPageResult = (page) => ({
      csv: fakeCsvFor(page),
      nextCursor: page === 0 ? 'cursor-after-page-0' : null,
      rowCount: page === 0 ? 500 : 100,
    });

    const run = await loadParentBody();
    await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    expect(
      metaStore.get('pagesTotal'),
      'pagesTotal must be Math.ceil(total / 500) = 2 for 600 rows — set once from the count before the loop, not derived per page',
    ).toBe(2);
    expect(
      metaStore.get('pagesDone'),
      'pagesDone must reach the page count after the loop — the bar reflects real per-page advancement, not a fixed or fabricated value',
    ).toBe(2);
  });

  it('does not advance the bar when the body never writes pagesDone', async () => {
    // Single page. The classic bug is "completes but bar stays at zero" — proven by
    // pagesDone reaching 1, not staying unset/zero, after one page.
    countInvoices.mockResolvedValue(120);

    const run = await loadParentBody();
    await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    expect(
      metaStore.get('pagesDone'),
      'after exactly one page, pagesDone must be 1 — a missing pagesDone write leaves the progress bar stuck at zero even though the run completes',
    ).toBe(1);
    expect(
      metaStore.get('pagesTotal'),
      'a single page (120 rows ≤ 500) means pagesTotal 1',
    ).toBe(1);
  });
});

// Requirement 3 — each page is keyed by a run-scoped idempotency key derived from
// [organizationId, 'page', String(page)], so a parent retry re-issues the SAME key and
// the runtime returns the cached page instead of re-executing it.
describe('Requirement 3 — run-scoped per-page key returns cached on retry', () => {
  it('derives the key from [organizationId, "page", String(page)]', async () => {
    countInvoices.mockResolvedValue(100);

    const run = await loadParentBody();
    await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    const firstCall = pageCalls[0];
    expect(
      firstCall?.idempotencyKey,
      'each page child must be triggered with an idempotencyKey built from [organizationId, "page", String(page)] — a missing or differently-shaped key breaks the retry cache',
    ).toBe('idem:org_acme|page|0');
  });

  it('a parent retry on the same run id returns the page cached, without re-executing', async () => {
    countInvoices.mockResolvedValue(100);

    // Attempt 1 of the parent run.
    const run1 = await loadParentBody();
    await run1(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );
    const executionsAfterFirst = pageExecutions;

    // Attempt 2 — a parent RETRY: same run id, so the per-page key is re-issued
    // identically and the platform serves the completed child from cache. (resetModules
    // does not clear pageCache/pageExecutions — only the parent module is reloaded.)
    vi.resetModules();
    const run2 = await loadParentBody();
    const out = await run2(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    expect(
      executionsAfterFirst,
      'the first attempt must execute the single page once',
    ).toBe(1);
    expect(
      pageExecutions,
      'a parent retry must NOT re-execute the completed page — folding Date.now() into the key, or a global scope, would change the key and force a re-run',
    ).toBe(1);

    const out2 = out as { runId: string } | { ok: true; runId: string };
    expect(
      (out2 as { runId: string }).runId,
      'the retried run reaches its terminal value carrying the same parent run id',
    ).toBe('run_parent');
  });

  it('a fresh parent run (new run id) does NOT reuse another run’s cached page', async () => {
    countInvoices.mockResolvedValue(100);

    const runA = await loadParentBody();
    await runA(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent_A' } } },
    );
    expect(pageExecutions, 'run A executes its page once').toBe(1);

    // A different parent run id. Because the key is run-scoped (per-run namespace),
    // run B re-issues a DIFFERENT effective key and must execute its own page.
    pageCache.clear();
    vi.resetModules();
    const runB = await loadParentBody();
    await runB(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent_B' } } },
    );
    expect(
      pageExecutions,
      'a different parent run must execute its own page — run-scoped keys are namespaced per run, not shared globally across runs',
    ).toBe(2);
  });
});

// Requirement 5 — exporting the empty org fails on the first attempt with no retries,
// via AbortTaskRunError, and spawns no paginate-page children.
describe('Requirement 5 — empty org aborts without retries and spawns no children', () => {
  it('throws AbortTaskRunError and fires no page children when the count is zero', async () => {
    const sdk = await import('@trigger.dev/sdk/v3');
    countInvoices.mockResolvedValue(0);

    const run = await loadParentBody();

    let thrown: unknown;
    try {
      await run(
        { organizationId: 'org_empty', requestedBy: 'user_alice' },
        { ctx: { run: { id: 'run_empty' } } },
      );
    } catch (error) {
      thrown = error;
    }

    expect(
      thrown instanceof sdk.AbortTaskRunError,
      'an empty resultset is a PERMANENT failure — it must throw AbortTaskRunError so the run fails once; a plain throw would burn all three retries on inputs that can never succeed',
    ).toBe(true);
    expect(
      pageCalls.length,
      'an empty org must abort BEFORE the loop — no paginate-page child may be triggered',
    ).toBe(0);
  });

  it('a non-empty org does NOT abort (the guard is for empty only)', async () => {
    const sdk = await import('@trigger.dev/sdk/v3');
    countInvoices.mockResolvedValue(50);

    const run = await loadParentBody();
    let thrown: unknown;
    try {
      await run(
        { organizationId: 'org_acme', requestedBy: 'user_alice' },
        { ctx: { run: { id: 'run_ok' } } },
      );
    } catch (error) {
      thrown = error;
    }

    expect(
      thrown instanceof sdk.AbortTaskRunError,
      'a seeded (non-empty) org must NOT abort — the abort guard fires only on a zero count',
    ).toBe(false);
    expect(pageCalls.length, 'a non-empty org must run its one page').toBe(1);
  });
});

// Requirement 4 — the page child reads exactly one page via cursor pagination and
// emits the CSV fragment for those rows, advancing the cursor.
describe('Requirement 4 — the page child emits a single-page CSV fragment', () => {
  type Row = { id: string };
  type ListArgs = {
    orgId: string;
    view: string;
    cursor: string | null;
    pageSize: number;
  };
  type ListResult = { rows: Row[]; nextCursor: string | null };
  type ListSpy = ReturnType<
    typeof vi.fn<(args: ListArgs) => Promise<ListResult>>
  >;

  const loadChildBody = async (
    listSpy: ListSpy,
  ): Promise<TaskConfig['run']> => {
    vi.resetModules();
    // The top-level mock blocks paginate-page so the PARENT body loads without its
    // real @/db chain. To exercise the CHILD body itself, load the real module here.
    vi.doUnmock('../../trigger/paginate-page');
    vi.doMock('@/db/queries/invoices', () => ({
      listInvoices: listSpy,
      countInvoices: vi.fn(),
    }));
    // rowsToCsv is covered by its own (chapter 062 / to-csv) suite; here it is a
    // visible stand-in so the fragment is the child's, not a re-test of CSV quoting.
    vi.doMock('@/lib/exports/to-csv', () => ({
      rowsToCsv: (rows: Row[]) => `csv[${rows.map((r) => r.id).join(',')}]`,
    }));
    await import('../../trigger/paginate-page');
    const cfg = capturedTasks.get('paginate-page');
    if (!cfg) {
      throw new Error(
        'paginate-page task was not defined via schemaTask — the child module did not register the task',
      );
    }
    return cfg.run;
  };

  it('reads one page via cursor pagination and returns its CSV fragment + nextCursor', async () => {
    const rows: Row[] = [{ id: 'inv_1' }, { id: 'inv_2' }, { id: 'inv_3' }];
    const listInvoices: ListSpy = vi.fn(async () => ({
      rows,
      nextCursor: 'cursor-next',
    }));

    const run = await loadChildBody(listInvoices);
    const out = (await run(
      { organizationId: 'org_acme', page: 0, cursor: null },
      { ctx: { run: { id: 'run_child' } } },
    )) as PageResult;

    const args = listInvoices.mock.calls[0]?.[0];
    expect(args?.view, 'the page read must request the active view').toBe(
      'active',
    );
    expect(
      args?.pageSize,
      'each page reads exactly PAGE_SIZE (500) rows — a different page size breaks the parent’s pagesTotal math',
    ).toBe(500);
    expect(args?.cursor, 'page 0 starts from a null cursor').toBeNull();

    expect(
      out.csv,
      'the child must return the CSV fragment for exactly this page’s rows (rowsToCsv of the page), not the whole export',
    ).toBe('csv[inv_1,inv_2,inv_3]');
    expect(
      out.nextCursor,
      'the child must hand back listInvoices’ nextCursor so the parent advances the cursor to the next page',
    ).toBe('cursor-next');
    expect(
      out.rowCount,
      'rowCount must be the number of rows on this page',
    ).toBe(3);
  });

  it('passes the incoming cursor straight through for a later page', async () => {
    const rows: Row[] = [{ id: 'inv_9' }];
    const listInvoices: ListSpy = vi.fn(async () => ({
      rows,
      nextCursor: null,
    }));

    const run = await loadChildBody(listInvoices);
    await run(
      { organizationId: 'org_acme', page: 1, cursor: 'cursor-from-page-0' },
      { ctx: { run: { id: 'run_child' } } },
    );

    const args = listInvoices.mock.calls[0]?.[0];
    expect(
      args?.cursor,
      'a later page must read FROM the cursor it was handed — dropping the cursor would re-read page 0 and duplicate rows',
    ).toBe('cursor-from-page-0');
  });
});
