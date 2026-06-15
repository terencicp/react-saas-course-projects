import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 2 — The task boundary: schemaTask and the per-org queue.
//
// The Trigger.dev worker runs out-of-process, so these gates never execute a real
// run. Instead they exercise the two seams the student owns in-process:
//
//   • the `exportInvoices` payload schema (the `schemaTask` boundary), imported and
//     parsed directly — proving a malformed payload is rejected at the edge; and
//   • the `startExport` Server Action driven through the REAL `authedAction`, with
//     only its infra dependencies (session, db, the Trigger SDK, next/cache) faked —
//     proving the insert → trigger → runId-update path, the daily-key short-circuit,
//     and the `member` gate.
//
// `tasks.trigger` and `idempotencyKeys.create` are stubbed: the stub emulates
// Trigger.dev's server-side dedup (same idempotencyKey ⇒ same run id) so the daily
// short-circuit is observable without a worker. node env, no DOM. Self-contained:
// every helper is inlined here.

// --- infra mocks: let startExport + the real authedAction load under node -----------

// `server-only` throws outside an RSC bundler; neutralise it so the real modules load.
vi.mock('server-only', () => ({}));

// revalidatePath has no cache to touch in the test runtime.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// authedAction reads request headers for ip / user-agent.
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

// The session the real authedAction resolves. Each test sets the return value (or
// makes it reject, to model an unauthenticated / non-member caller).
const requireOrgUser =
  vi.fn<() => Promise<{ user: { id: string }; orgId: string; role: string }>>();
vi.mock('@/lib/auth', () => ({ requireOrgUser }));

// Recording fake for the tenant db facade: captures every insert/update so the gates
// can assert the queued-row write and the post-trigger runId update.
const dbCalls = {
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
};
let nextInsertedId = 'row_1';
vi.mock('@/db/tenant', () => ({
  tenantDb: () => ({
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        dbCalls.inserts.push(value);
        return { returning: async () => [{ id: nextInsertedId }] };
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        dbCalls.updates.push(value);
        return { where: async () => undefined };
      },
    }),
  }),
}));

// Trigger SDK stub. `trigger` records its args and emulates Trigger.dev's global
// idempotency dedup: a repeat call carrying an idempotencyKey already seen returns
// the FIRST run's id instead of minting a new one.
type TriggerOptions = {
  concurrencyKey?: string;
  idempotencyKey?: string;
  idempotencyKeyTTL?: string;
  tags?: string[];
};
type TriggerCall = { id: string; payload: unknown; options: TriggerOptions };
const triggerCalls: TriggerCall[] = [];
const runIdByKey = new Map<string, string>();
let runSeq = 0;
const trigger = vi.fn(
  async (id: string, payload: unknown, options: TriggerOptions = {}) => {
    triggerCalls.push({ id, payload, options });
    const key = options.idempotencyKey;
    if (key !== undefined && runIdByKey.has(key)) {
      return { id: runIdByKey.get(key) as string };
    }
    const newRunId = `run_${++runSeq}`;
    if (key !== undefined) runIdByKey.set(key, newRunId);
    return { id: newRunId };
  },
);
// Keep the real `queue` / `schemaTask` / `AbortTaskRunError` / `metadata` (the task
// module needs them to build its schema) and override only the trigger surface the
// action uses.
vi.mock('@trigger.dev/sdk/v3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@trigger.dev/sdk/v3')>();
  return {
    ...actual,
    tasks: { trigger },
    // A stable, deterministic key from its parts — the same parts produce the same
    // string, which is what makes the dedup above fire on a same-day repeat.
    idempotencyKeys: {
      create: async (parts: string[]) => `idem:${parts.join('|')}`,
    },
  };
});

const noForm = () => new FormData();

// Loads a fresh copy of the action against the current mock state.
const loadStartExport = async () => {
  const mod = await import('@/lib/exports/start');
  return mod.startExport;
};

beforeEach(() => {
  triggerCalls.length = 0;
  dbCalls.inserts.length = 0;
  dbCalls.updates.length = 0;
  runIdByKey.clear();
  runSeq = 0;
  nextInsertedId = 'row_1';
  trigger.mockClear();
  vi.resetModules();
  requireOrgUser.mockReset();
  requireOrgUser.mockResolvedValue({
    user: { id: 'user_alice' },
    orgId: 'org_acme',
    role: 'member',
  });
});

// Requirement 1 — firing the export inserts one queued row, fires export-invoices
// with the right payload, and stamps the row with the returned runId.
describe('Requirement 1 — insert → trigger → runId update', () => {
  it('inserts a queued exports row before firing the task', async () => {
    const startExport = await loadStartExport();
    const result = await startExport(null, noForm());

    expect(
      result.ok,
      'startExport should succeed for a member caller — it still returns an error Result, so the insert/trigger/update path is not wired yet',
    ).toBe(true);

    expect(
      dbCalls.inserts.length,
      'expected exactly one exports row to be inserted before the trigger fires',
    ).toBe(1);
    const inserted = dbCalls.inserts[0] ?? {};
    expect(
      inserted.status,
      'the pre-trigger row must be inserted with status "queued" so it exists for the daily-key dedup',
    ).toBe('queued');
    expect(
      inserted.runId,
      'the row is inserted with runId: null — the real runId is stamped only after the trigger returns',
    ).toBeNull();
    expect(
      inserted.dayBucket,
      'the row must carry the dayBucket (YYYY-MM-DD) the business key dedups on',
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fires export-invoices with the { organizationId, requestedBy } payload', async () => {
    const startExport = await loadStartExport();
    await startExport(null, noForm());

    expect(
      triggerCalls.length,
      'startExport should fire exactly one task — it has not called tasks.trigger yet',
    ).toBe(1);
    const call = triggerCalls[0];
    if (!call) throw new Error('no trigger call recorded');
    expect(
      call.id,
      'the durable task identity is the string "export-invoices" — that is what Trigger.dev keys on',
    ).toBe('export-invoices');
    expect(
      call.payload,
      'a task has no request context, so organizationId + requestedBy must travel in the payload',
    ).toEqual({ organizationId: 'org_acme', requestedBy: 'user_alice' });
  });

  it('stamps the inserted row with the runId the trigger returns', async () => {
    const startExport = await loadStartExport();
    const result = await startExport(null, noForm());

    if (!result.ok) throw new Error('expected an ok Result carrying the runId');
    const returnedRunId = result.data.runId;
    expect(
      returnedRunId,
      'the action returns the handle id from tasks.trigger so the inspector can poll the new run',
    ).toBe('run_1');
    expect(
      dbCalls.updates.length,
      'after the trigger returns, the queued row must be updated once with the runId',
    ).toBe(1);
    expect(
      (dbCalls.updates[0] ?? {}).runId,
      'the post-trigger update must write the returned runId onto the row',
    ).toBe(returnedRunId);
  });
});

// Requirement 2 — a same-day re-trigger for the same org+user returns the first
// run's id (the global daily idempotency key short-circuits), leaving one logical run.
describe('Requirement 2 — the daily key short-circuits a duplicate', () => {
  it('returns the first run id when the same org+user fires again the same day', async () => {
    const startExport = await loadStartExport();

    const first = await startExport(null, noForm());
    const second = await startExport(null, noForm());

    if (!first.ok || !second.ok) {
      throw new Error('both same-day triggers should return an ok Result');
    }
    expect(
      second.data.runId,
      'a second same-day click must collapse to the first run via the global daily idempotency key — different ids mean the key is missing or not derived from (org, user, day)',
    ).toBe(first.data.runId);

    const keys = triggerCalls.map((c) => c.options.idempotencyKey);
    expect(
      keys[0],
      'tasks.trigger must be called with an idempotencyKey — without it Trigger.dev cannot dedup the day',
    ).toBeTruthy();
    expect(
      keys[1],
      'both same-day calls must carry the SAME idempotencyKey for the dedup to fire',
    ).toBe(keys[0]);
  });

  it('passes idempotencyKeyTTL "24h" and a per-org concurrencyKey on the trigger', async () => {
    const startExport = await loadStartExport();
    await startExport(null, noForm());

    const options: TriggerOptions = triggerCalls[0]?.options ?? {};
    expect(
      options.idempotencyKeyTTL,
      'the daily key is scoped to 24h so the next day can export again',
    ).toBe('24h');
    expect(
      options.concurrencyKey,
      'concurrencyKey must be the org id — that is the per-tenant lane on the shared export queue (sequential within an org, parallel across orgs)',
    ).toBe('org_acme');
  });
});

// Requirement 3 — a malformed payload is rejected at the schema boundary, before the
// task body runs. Asserted directly against the shipped strictObject payload schema.
describe('Requirement 3 — the schemaTask payload boundary rejects bad input', () => {
  // The task module reaches @/db + child tasks through its body; stub those imports
  // so the module loads and its (pure) Zod schema is readable in node.
  beforeEach(() => {
    vi.doMock('@/db/audit-log', () => ({ logAudit: vi.fn() }));
    vi.doMock('@/db/queries/invoices', () => ({
      countInvoices: vi.fn(),
      listInvoices: vi.fn(),
    }));
    vi.doMock('../../trigger/paginate-page', () => ({ paginatePage: {} }));
    vi.doMock('../../trigger/send-export-email', () => ({
      sendExportEmail: {},
    }));
  });

  const loadSchema = async () => {
    const mod = await import('../../trigger/export-invoices');
    const task = mod.exportInvoices as unknown as {
      schema: { safeParse: (v: unknown) => { success: boolean } };
    };
    return task.schema;
  };

  it('accepts a well-formed { organizationId, requestedBy } payload', async () => {
    const schema = await loadSchema();
    expect(
      schema.safeParse({
        organizationId: 'org_acme',
        requestedBy: 'user_alice',
      }).success,
      'a valid payload with both ids must pass the boundary',
    ).toBe(true);
  });

  it('rejects an empty organizationId (fails .min(1))', async () => {
    const schema = await loadSchema();
    expect(
      schema.safeParse({ organizationId: '', requestedBy: 'user_alice' })
        .success,
      'ids are z.string().min(1); an empty organizationId must fail at the edge before any retry is spent',
    ).toBe(false);
  });

  it('rejects an extra key (strictObject)', async () => {
    const schema = await loadSchema();
    expect(
      schema.safeParse({
        organizationId: 'org_acme',
        requestedBy: 'user_alice',
        rogue: true,
      }).success,
      'z.strictObject must reject an unexpected key so a malformed payload never reaches the body',
    ).toBe(false);
  });

  it('uses string ids, not uuids (the seed assigns base62 ids like org_acme)', async () => {
    const schema = await loadSchema();
    expect(
      schema.safeParse({
        organizationId: 'org_acme',
        requestedBy: 'user_alice',
      }).success,
      'the payload ids are z.string().min(1), not z.uuid() — a uuid schema would reject the seed ids',
    ).toBe(true);
  });
});

// Requirement 4 — the action is gated to `member`; a caller the gate refuses never
// reaches the trigger.
describe('Requirement 4 — the member gate fires nothing when refused', () => {
  it('does not fire a trigger when the auth gate refuses the caller', async () => {
    // Model a caller the gate turns away (no membership / unauthenticated): the real
    // requireOrgUser redirects, which surfaces as a throw the action does not swallow.
    const redirect = new Error('NEXT_REDIRECT');
    requireOrgUser.mockRejectedValueOnce(redirect);

    const startExport = await loadStartExport();
    await expect(
      startExport(null, noForm()),
      'a refused caller must be turned away before any work — the action should not catch the gate refusal',
    ).rejects.toBe(redirect);

    expect(
      triggerCalls.length,
      'no task may be fired for a caller the member gate rejects',
    ).toBe(0);
    expect(
      dbCalls.inserts.length,
      'no exports row may be written for a rejected caller',
    ).toBe(0);
  });

  it('lets an authorised member through to the trigger', async () => {
    // Positive control: the same code path fires for a valid member, so the gate is
    // a gate — not a blanket block.
    const startExport = await loadStartExport();
    const result = await startExport(null, noForm());
    expect(result.ok, 'a member caller must be allowed to export').toBe(true);
    expect(
      triggerCalls.length,
      'the authorised path must reach tasks.trigger',
    ).toBe(1);
  });
});
