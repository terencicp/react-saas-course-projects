import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 4 — Send the email, write the audit log.
//
// The Trigger.dev worker runs out-of-process, so these gates never execute a real
// run against the platform. Instead they execute the student's task BODIES in-process
// by intercepting `schemaTask` at the SDK mock boundary: the mock captures each
// task's run config so the gate can call `run(payload, { ctx })` directly. Around the
// body it fakes only the platform/data seams this lesson is about —
//
//   • the email child's `triggerAndWait(...).unwrap()` is faked with a runtime that
//     emulates Trigger.dev's idempotency dedup — a repeat call carrying a key already
//     seen returns the cached Result WITHOUT re-executing the child, so "no second
//     email on a parent retry" is provable;
//   • `tenantDb(orgId).transaction` is a recording stub — the exports-row UPDATE and
//     the `logAudit` write inside it are captured, so the closing transaction's
//     observable effects (status → completed, the audit action + payload) are checked;
//   • `idempotencyKeys.create` is a deterministic stringifier of its parts, so the
//     run-scoped `[orgId, 'export-email']` key shape is observable; and
//   • `sendEmail` is a recording stub whose Result the gate controls, so the child
//     body's send/suppression branches are exercised without a live Resend call.
//
// The DB + sibling-task modules the bodies import are mocked so the real `@/db` (and
// its env boundary) never loads. node env, no DOM. Self-contained: every helper is
// inlined here.

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

// metadata.set writes land here; the body sets downloadUrl through it.
const metaStore = new Map<string, unknown>();

// --- the email-child platform runtime -----------------------------------------------
//
// Emulates the platform's run of the sendExportEmail child: records every
// triggerAndWait call and, given an idempotencyKey, dedups a repeat (returns the
// cached Result, no re-execution — modelling the cached child on a parent retry).

type EmailResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: { code: string; userMessage: string } };
type EmailCall = {
  payload: {
    organizationId: string;
    recipientUserId: string;
    rowCount: number;
    downloadUrl: string;
  };
  idempotencyKey: string | undefined;
};
const emailCalls: EmailCall[] = [];
const emailCache = new Map<string, EmailResult>();
let emailExecutions = 0;
// The Result the child WOULD produce on a fresh execution.
let freshEmailResult: EmailResult = { ok: true, data: { id: 'email_1' } };

const makeSendExportEmailStub = () => ({
  triggerAndWait: (
    payload: EmailCall['payload'],
    options: { idempotencyKey?: string } = {},
  ) => {
    const key = options.idempotencyKey;
    emailCalls.push({ payload, idempotencyKey: key });
    return {
      unwrap: async (): Promise<EmailResult> => {
        if (key !== undefined && emailCache.has(key)) {
          // Cache hit: the platform returns the prior child Result; the child body
          // does NOT run again. emailExecutions stays put — no second Resend send.
          return emailCache.get(key) as EmailResult;
        }
        emailExecutions += 1;
        const result = freshEmailResult;
        if (key !== undefined) emailCache.set(key, result);
        return result;
      },
    };
  },
});

// --- the closing-transaction recorder -----------------------------------------------
//
// Records the exports-row UPDATE and forwards the tx to logAudit so its captured
// write is the body's actual audit call. One transaction per `transaction(fn)`.

type ExportsUpdate = Record<string, unknown>;
const exportsUpdates: { set: ExportsUpdate }[] = [];
let transactionCount = 0;

const makeTenantDb = () => () => ({
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    transactionCount += 1;
    const tx = {
      update: () => ({
        set: (value: ExportsUpdate) => ({
          where: async () => {
            exportsUpdates.push({ set: value });
            return undefined;
          },
        }),
      }),
    };
    return fn(tx);
  },
  // Used by the CHILD body's recipient lookup (overridden per-test where needed).
  query: {
    member: { findFirst: async () => undefined },
  },
});

// --- the logAudit recorder ----------------------------------------------------------

type AuditEvent = {
  action: string;
  subjectType?: string;
  subjectId?: string;
  organizationId?: string;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
};
const auditEvents: AuditEvent[] = [];
const logAudit = vi.fn(async (_tx: unknown, event: AuditEvent) => {
  auditEvents.push(event);
});

// --- the sendEmail recorder (child body) --------------------------------------------

type SendInput = {
  to: string;
  subject: string;
  react: unknown;
  idempotencyKey: string;
};
const sendCalls: SendInput[] = [];
let sendEmailResult: EmailResult = { ok: true, data: { id: 'resend_1' } };
const sendEmail = vi.fn(async (input: SendInput): Promise<EmailResult> => {
  sendCalls.push(input);
  return sendEmailResult;
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
    // what makes the email dedup fire on a parent retry. Run-scoping is the default
    // and is modelled by the parent reusing the SAME ctx.run.id across attempts.
    idempotencyKeys: {
      create: async (parts: string[]) => `idem:${parts.join('|')}`,
    },
  };
});

// The parent body counts pages through countInvoices; one page keeps the loop short.
const countInvoices = vi.fn<(args: { orgId: string }) => Promise<number>>();
vi.mock('@/db/queries/invoices', () => ({
  countInvoices,
  listInvoices: vi.fn(),
}));

vi.mock('@/db/audit-log', () => ({ logAudit }));

// The tenant facade is shared by the parent close-out transaction and the child's
// recipient lookup. Re-created per import so its inner stubs read current state.
vi.mock('@/db/tenant', () => ({ tenantDb: makeTenantDb() }));

// The page child the parent loops over (covered by Lesson 3). Inert single page here.
vi.mock('../../trigger/paginate-page', () => ({
  paginatePage: {
    triggerAndWait: () => ({
      unwrap: async () => ({ csv: 'page-csv', nextCursor: null, rowCount: 1 }),
    }),
  },
}));

// The email child as the parent sees it — the platform seam the close-out triggers.
vi.mock('../../trigger/send-export-email', () => ({
  sendExportEmail: makeSendExportEmailStub(),
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

beforeEach(() => {
  capturedTasks.clear();
  metaStore.clear();
  emailCalls.length = 0;
  emailCache.clear();
  emailExecutions = 0;
  freshEmailResult = { ok: true, data: { id: 'email_1' } };
  exportsUpdates.length = 0;
  transactionCount = 0;
  auditEvents.length = 0;
  logAudit.mockClear();
  sendCalls.length = 0;
  sendEmailResult = { ok: true, data: { id: 'resend_1' } };
  sendEmail.mockClear();
  countInvoices.mockReset();
  countInvoices.mockResolvedValue(100);
  vi.resetModules();
});

// Requirement 1 — a full run ends at status: completed with the downloadUrl carried
// and exactly one new export.invoices.completed audit row.
describe('Requirement 1 — the run closes: exports row → completed + one audit row', () => {
  it('runs ONE closing transaction that updates the exports row to completed with the row count', async () => {
    const run = await loadParentBody();
    const out = (await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    )) as { ok: true; runId: string; rowCount: number };

    expect(
      transactionCount,
      'the close-out must run inside exactly ONE tenantDb transaction — the exports-row update and the audit write commit or roll back together',
    ).toBe(1);

    const update = exportsUpdates[0];
    expect(
      update?.set.status,
      'the closing transaction must flip the exports row to status "completed" — without it the run stays "running" forever in the inspector',
    ).toBe('completed');
    expect(
      update?.set.rowCount,
      'the exports row must record the exported rowCount (the count total) on completion',
    ).toBe(100);
    expect(
      update?.set.completedAt instanceof Date,
      'the exports row must stamp completedAt when the run finishes',
    ).toBe(true);

    expect(
      out.ok,
      'the parent must return its terminal { ok: true } once the close-out has committed',
    ).toBe(true);
    expect(out.runId, 'the terminal value carries the parent run id').toBe(
      'run_parent',
    );
    expect(
      out.rowCount,
      'the terminal value reports the exported rowCount',
    ).toBe(100);
  });

  it('writes exactly one export.invoices.completed audit row as the system actor', async () => {
    const run = await loadParentBody();
    await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    const completed = auditEvents.filter(
      (e) => e.action === 'export.invoices.completed',
    );
    expect(
      completed.length,
      'the close-out must write exactly ONE export.invoices.completed audit row — the append-only record that the run finished',
    ).toBe(1);

    const event = completed[0];
    expect(
      event?.organizationId,
      'the audit row must be written with explicit organizationId context — a task has no session for logAudit to derive it from',
    ).toBe('org_acme');
    expect(
      event?.actorUserId,
      'actorUserId must be null — a task has no session, so the system-actor null is information, not a missing value',
    ).toBeNull();
    expect(
      event?.subjectId,
      'the audited subject is the run — subjectId must be the parent run id',
    ).toBe('run_parent');
    expect(
      event?.payload?.rowCount,
      'the audit payload must record the exported rowCount',
    ).toBe(100);
  });
});

// Requirement 2 — a parent retry after the email step sends no second email: the child
// is keyed by the run-scoped [orgId, 'export-email'] key, so the retry serves the
// cached Result and the child body never re-runs (Resend is never called twice).
describe('Requirement 2 — the email child is guarded once across a parent retry', () => {
  it('triggers the email child with the run-scoped [organizationId, "export-email"] key', async () => {
    const run = await loadParentBody();
    await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    const call = emailCalls[0];
    expect(
      call,
      'the close-out must trigger the sendExportEmail child — an inline sendEmail in the parent loses the per-step idempotency guard',
    ).toBeDefined();
    expect(
      call?.idempotencyKey,
      'the email child must be triggered with an idempotencyKey built from [organizationId, "export-email"] — a missing or per-attempt key re-sends on every parent retry',
    ).toBe('idem:org_acme|export-email');
    expect(
      call?.payload.recipientUserId,
      'the recipient must be requestedBy — whoever clicked Export',
    ).toBe('user_alice');
  });

  it('a parent retry on the same run id returns the email cached — the child does not run again', async () => {
    // Attempt 1 of the parent run.
    const run1 = await loadParentBody();
    await run1(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );
    expect(emailExecutions, 'the first attempt sends the email once').toBe(1);

    // Attempt 2 — a parent RETRY: same run id, so the run-scoped email key is re-issued
    // identically and the platform serves the cached child Result. (resetModules does
    // not clear emailCache/emailExecutions — only the parent module is reloaded.)
    vi.resetModules();
    const run2 = await loadParentBody();
    await run2(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    expect(
      emailExecutions,
      'a parent retry must NOT re-send the email — the run-scoped key serves the cached child Result; an inline send or a per-attempt key would fire Resend a second time',
    ).toBe(1);
  });
});

// Requirement 3 — a suppressed recipient still completes the run: no email is sent and
// the audit payload records emailSuppressed: true.
describe('Requirement 3 — a suppressed recipient completes the run with emailSuppressed', () => {
  it('records emailSuppressed: true in the audit payload and still completes when the child returns a forbidden Result', async () => {
    // The email child reports a suppression as an EXPECTED outcome (an err Result),
    // not a throw.
    freshEmailResult = {
      ok: false,
      error: { code: 'forbidden', userMessage: 'suppressed' },
    };

    const run = await loadParentBody();
    const out = (await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    )) as { ok: true };

    expect(
      out.ok,
      'a suppression is not a crash — the run must still complete (the export succeeded; only the notification was skipped)',
    ).toBe(true);

    const completed = auditEvents.find(
      (e) => e.action === 'export.invoices.completed',
    );
    expect(
      completed?.payload?.emailSuppressed,
      'the audit payload must record emailSuppressed: true when the email child returns a forbidden Result — the log captures the skip, not a missing field',
    ).toBe(true);
  });

  it('records emailSuppressed: false on the happy path', async () => {
    freshEmailResult = { ok: true, data: { id: 'email_1' } };

    const run = await loadParentBody();
    await run(
      { organizationId: 'org_acme', requestedBy: 'user_alice' },
      { ctx: { run: { id: 'run_parent' } } },
    );

    const completed = auditEvents.find(
      (e) => e.action === 'export.invoices.completed',
    );
    expect(
      completed?.payload?.emailSuppressed,
      'when the email sends, the audit payload must record emailSuppressed: false — the flag is derived from the child Result, not hard-coded',
    ).toBe(false);
  });
});

// Requirement 3 (child body) — the sendExportEmail child sends once via the per-recipient
// idempotencyKey and forwards a suppression as a Result rather than throwing; a non-member
// recipient never reaches a send.
describe('Requirement 3 (child) — the email child guards the send and forwards suppression as a Result', () => {
  const loadChildBody = async (
    recipient: { user: { email: string } } | undefined,
  ): Promise<TaskConfig['run']> => {
    vi.resetModules();
    // Exercise the CHILD body itself: load the real module (the parent-facing stub
    // above is bypassed by importing it directly).
    vi.doUnmock('../../trigger/send-export-email');
    vi.doMock('@/db/tenant', () => ({
      tenantDb: () => ({
        query: { member: { findFirst: async () => recipient } },
      }),
    }));
    // The global org read for the name, and the email adapter the child calls.
    vi.doMock('@/db', () => ({
      db: {
        query: { organization: { findFirst: async () => ({ name: 'Acme' }) } },
      },
    }));
    vi.doMock('@/lib/email', () => ({ sendEmail }));
    // The email template renders to a React element; a visible stand-in keeps this
    // gate about the send, not the markup (the template is provided, Chapter 050).
    vi.doMock('@/emails/ExportReadyEmail', () => ({
      default: (props: unknown) => ({ template: 'ExportReadyEmail', props }),
    }));
    await import('../../trigger/send-export-email');
    const cfg = capturedTasks.get('send-export-email');
    if (!cfg) {
      throw new Error(
        'send-export-email task was not defined via schemaTask — the child module did not register the task',
      );
    }
    return cfg.run;
  };

  it('sends with a stable per-recipient idempotencyKey and returns the ok Result', async () => {
    sendEmailResult = { ok: true, data: { id: 'resend_1' } };

    const run = await loadChildBody({ user: { email: 'alice@acme.test' } });
    const out = (await run(
      {
        organizationId: 'org_acme',
        recipientUserId: 'user_alice',
        rowCount: 100,
        downloadUrl: 'https://example.com/exports/run_1.csv',
      },
      { ctx: { run: { id: 'run_child' } } },
    )) as EmailResult;

    expect(
      sendCalls.length,
      'the child must call sendEmail once for a member recipient',
    ).toBe(1);
    expect(
      sendCalls[0]?.idempotencyKey,
      'the send must carry a stable per-recipient idempotencyKey (export-email:org:recipient:rowCount) so a child retry never duplicates the Resend send',
    ).toBe('export-email:org_acme:user_alice:100');
    expect(
      out.ok,
      'a successful send returns the ok Result the parent unwraps',
    ).toBe(true);
  });

  it('forwards a suppression as an err Result rather than throwing', async () => {
    sendEmailResult = {
      ok: false,
      error: { code: 'forbidden', userMessage: 'suppressed' },
    };

    const run = await loadChildBody({ user: { email: 'alice@acme.test' } });
    let thrown: unknown;
    let out: EmailResult | undefined;
    try {
      out = (await run(
        {
          organizationId: 'org_acme',
          recipientUserId: 'user_alice',
          rowCount: 100,
          downloadUrl: 'https://example.com/exports/run_1.csv',
        },
        { ctx: { run: { id: 'run_child' } } },
      )) as EmailResult;
    } catch (error) {
      thrown = error;
    }

    expect(
      thrown,
      'a suppression is an expected outcome — the child must RETURN the err Result, never throw (a throw would fail the run on a deliverability fact about the user)',
    ).toBeUndefined();
    expect(out?.ok, 'the suppressed send returns an err Result').toBe(false);
  });

  it('never reaches a send when the recipient is no longer a member', async () => {
    const run = await loadChildBody(undefined);
    const out = (await run(
      {
        organizationId: 'org_acme',
        recipientUserId: 'user_ghost',
        rowCount: 100,
        downloadUrl: 'https://example.com/exports/run_1.csv',
      },
      { ctx: { run: { id: 'run_child' } } },
    )) as EmailResult;

    expect(
      sendCalls.length,
      'a non-member recipient must never reach a send — the member→user join is the guard that an arbitrary id cannot trigger an email',
    ).toBe(0);
    expect(
      out.ok,
      'a missing member returns an err Result (not_found), not a send',
    ).toBe(false);
  });
});
