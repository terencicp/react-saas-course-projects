import postgres from 'postgres';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { InvoiceListRow } from '@/lib/invoices/queries';

// Lesson 5 — Optimistic create.
//
// This suite drives the student's own optimistic-create wiring and asserts the
// *observable result*, never file paths, export names, or imports:
//   - what the inline create form paints on first render — the client-generated
//     UUIDv7 reconcile key it posts as the hidden `id`, which is what lets the
//     optimistic row and the persisted row share a key (reqs 1 and 2),
//   - what `OptimisticInvoicesList` paints for the existing rows — one detail
//     link per row, keyed by its real id, no duplication (req 2),
//   - what `createInvoice` (the public surface of src/lib/invoices/actions.ts)
//     does when the `_debug_fail` seam is set: after a short delay it returns an
//     `internal` Result carrying the banner message, and persists nothing — the
//     failure the automatic rollback rides on (req 3).
//
// Node env, no DOM. The instant-paint of the pending row and the flicker-free
// swap on success are DOM-paint behaviors driven by a React transition; those
// are the [untested], hand-verified parts. What is unit-observable here is the
// shape the student's code emits before any interaction (the reconcile key, the
// failure seam) and the action's `_debug_fail` branch.
//
// Scope is the Lesson 5 optimistic-create path only:
//   req 1 — the inline form posts a client-generated UUIDv7 as the hidden id (the
//           reconcile key the instant pending row is built from),
//   req 2 — the list renders existing rows keyed by their real id as detail
//           links, exactly once each (so a revalidated row reconciles by key
//           instead of duplicating the optimistic one),
//   req 3 — `_debug_fail` makes createInvoice return an internal Result with a
//           userMessage after the sleep, persisting nothing.
// The literal instant-paint, the no-flicker swap, the value-retention after
// failure (req 4), and the edit form staying non-optimistic (req 5) are
// [untested] — UI-paint / interaction checks a human verifies by hand.
//
// Before running it, make sure the database is up, migrated, and seeded:
//
//   docker compose up -d
//   pnpm db:migrate
//   pnpm db:seed
//
// The action reaches the DB through `@/db` → `@/env`, and @t3-oss/env validates
// the environment at import time. Vitest does not load .env (only the db:*
// scripts do, via dotenv-cli), so we set the required variables on process.env
// *before* importing the action. Without this the import would throw "Invalid
// environment variables" and every test would error at setup rather than fail
// informatively.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  'postgres://postgres:postgres@localhost:5432/app';

process.env.DATABASE_URL = DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED =
  process.env.DATABASE_URL_UNPOOLED ?? DATABASE_URL;
process.env.SEED = process.env.SEED ?? '1';

// `next/cache` and `next/navigation` are framework boundaries, not student code.
// Outside a Next.js request there is no static-generation store, so the real
// `revalidatePath` throws an internal invariant before the action can reach its
// redirect. We stub both with the same contract the action relies on: a no-op
// cache revalidation, and a `redirect` that throws a recognizable sentinel
// carrying its target (the real `redirect` also signals by throwing). This lets
// us observe whether the student's action redirected (and where) without faking
// any of its own logic.
const REDIRECT_SENTINEL = '__NEXT_REDIRECT__';
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const error = new Error(REDIRECT_SENTINEL) as Error & {
      redirectTo?: string;
    };
    error.redirectTo = url;
    throw error;
  },
}));

// A read-only auditor connection, separate from the one the action uses, so we
// observe exactly the rows the student's code committed (or didn't) and clean up
// after.
const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

// Resolve a real customer that belongs to the active-context org (Acme, slug
// 'acme'). The seed assigns ids via uuidv7(), so they differ across seeds —
// resolve by natural key at run time instead of hard-coding a UUID, exactly as
// getActiveContext() does for the org/user.
const findAcmeCustomerId = async (): Promise<string> => {
  const [row] = await sql<{ id: string }[]>`
    select c.id::text as id
    from customers c
    join organizations o on o.id = c.organization_id
    where o.slug = 'acme'
    limit 1
  `;
  if (!row) {
    throw new Error(
      'No customer found for the Acme org. Start Postgres, migrate, and seed ' +
        '(`docker compose up -d` → `pnpm db:migrate` → `pnpm db:seed`) before ' +
        "running this lesson's tests.",
    );
  }
  return row.id;
};

// A unique invoice number per call: the invoices table has a unique
// (organization_id, number) constraint, so reusing a number across our own
// fixtures would surface as a conflict and muddy the behavior under test.
const uniqueNumber = (tag: string) =>
  `INV-L5-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Build the FormData the create form posts. `_debug_fail` is the chapter-local
// failure-injection seam this lesson adds to drive the rollback verification.
const createFields = (
  customerId: string,
  number: string,
  opts: { debugFail?: boolean } = {},
) => {
  const fd = new FormData();
  fd.set('customerId', customerId);
  fd.set('number', number);
  fd.set('status', 'draft');
  fd.set('total', '100.00');
  fd.set('issuedAt', '2026-01-01');
  fd.set('dueAt', '2026-02-01');
  fd.set('currency', 'USD');
  if (opts.debugFail) {
    fd.set('_debug_fail', '1');
  }
  return fd;
};

// Call the action and report what came back: a returned `Result` (the failure
// branches) or the redirect target (the success branch, which the action signals
// by throwing the stubbed redirect).
const runCreate = async (
  formData: FormData,
): Promise<{ result?: unknown; redirectTo?: string; threw?: unknown }> => {
  const { createInvoice } = await import('@/lib/invoices/actions');
  try {
    const result = await createInvoice(null, formData);
    return { result };
  } catch (error) {
    const redirectTo = (error as { redirectTo?: string })?.redirectTo;
    if (redirectTo) {
      return { redirectTo };
    }
    return { threw: error };
  }
};

const rowCountByNumber = async (number: string): Promise<number> => {
  const [row] = await sql<{ c: number }[]>`
    select count(*)::int as c from invoices where number = ${number}
  `;
  return row?.c ?? 0;
};

// A persisted list row in the joined shape `listInvoices` returns. We render the
// list with one of these to read what a *settled* (non-pending) row paints — the
// shape the optimistic row reconciles into.
const persistedRow = (overrides: {
  id: string;
  number: string;
  customerName: string;
  customerId?: string;
}): InvoiceListRow =>
  ({
    id: overrides.id,
    organizationId: '00000000-0000-0000-0000-000000000001',
    customerId: '00000000-0000-0000-0000-000000000002',
    createdBy: '00000000-0000-0000-0000-000000000003',
    number: overrides.number,
    status: 'draft',
    total: '100.00',
    currency: 'USD',
    issuedAt: new Date('2026-01-01'),
    dueAt: new Date('2026-02-01'),
    createdAt: new Date('2026-01-01'),
    customer: {
      id: overrides.customerId ?? '00000000-0000-0000-0000-000000000002',
      organizationId: '00000000-0000-0000-0000-000000000001',
      name: overrides.customerName,
      email: 'c@example.test',
      createdAt: new Date('2026-01-01'),
    },
  }) as unknown as InvoiceListRow;

// Render OptimisticInvoicesList (the inline list + the create form it provides
// context to) to static markup. createElement, not a direct call: these are real
// Client Components using hooks (useOptimistic, useActionState, useState), which
// only work when React's renderer drives them.
const renderList = async (initialInvoices: InvoiceListRow[]) => {
  const { OptimisticInvoicesList } = await import(
    '@/app/invoices/_components/optimistic-invoices-list'
  );
  try {
    return renderToStaticMarkup(
      createElement(OptimisticInvoicesList, {
        initialInvoices,
        customers: [
          { id: '00000000-0000-0000-0000-000000000002', name: 'Acme Co' },
        ],
      }),
    );
  } catch (error) {
    throw new Error(
      'OptimisticInvoicesList threw while rendering. On /invoices it must wire ' +
        'useOptimistic over initialInvoices and provide the appender to the inline ' +
        `NewInvoiceForm. Underlying error: ${String(error)}`,
    );
  }
};

// A UUIDv7 is a v7 UUID: 8-4-4-4-12 hex with the version nibble '7'. We match the
// canonical form (and the v7 marker) rather than any 36-char string, so a
// throwaway temp id like "temp-1" or a random non-v7 token is rejected — the
// reconcile depends on a real client-generated id, not a placeholder.
const UUIDV7_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

// Pull the value of `<input type="hidden" name="id" ...>` out of the rendered
// form markup, however the attribute order falls.
const hiddenIdValue = (markup: string): string | undefined => {
  for (const tag of markup.match(/<input\b[^>]*>/gi) ?? []) {
    if (/name="id"/.test(tag) && /type="hidden"/.test(tag)) {
      return tag.match(/value="([^"]*)"/)?.[1];
    }
  }
  return undefined;
};

beforeAll(async () => {
  // Fail loudly and early if the database is unreachable, so a connection
  // problem never masquerades as a missing-feature failure below.
  try {
    await sql`select 1`;
  } catch (cause) {
    throw new Error(
      `Could not reach Postgres at ${DATABASE_URL}. Start the database with ` +
        '`docker compose up -d`, migrate with `pnpm db:migrate`, and seed with ' +
        "`pnpm db:seed` before running this lesson's tests.",
      { cause },
    );
  }
});

const createdNumbers: string[] = [];

afterAll(async () => {
  // Remove any rows this suite committed so re-runs stay clean. (The _debug_fail
  // path should persist nothing, but we register the number defensively.)
  if (createdNumbers.length > 0) {
    await sql`delete from invoices where number in ${sql(createdNumbers)}`;
  }
  await sql.end();
});

// Requirement 1 — submitting a valid invoice through the inline form on
// /invoices paints a pending row at the top immediately. The literal instant
// paint is a DOM-transition behavior (hand-verified). What is node-observable is
// the prerequisite that makes the pending row able to *become* the persisted
// row: the form generates a real client id at mount and posts it as the hidden
// `id`. That id is the key the optimistic frame and the revalidated row share —
// without it (or with a throwaway temp string) the swap can't reconcile by key.
describe('the inline create form posts a client-generated UUIDv7 reconcile key (req 1)', () => {
  it('renders a hidden id input whose value is a real UUIDv7', async () => {
    // No existing rows — keep the markup focused on the inline form.
    const markup = await renderList([]);

    const idValue = hiddenIdValue(markup);

    expect(
      idValue,
      'The inline create form must post a client-generated id so the optimistic ' +
        'row and the revalidated row can share a key. Render ' +
        '<input type="hidden" name="id" defaultValue={tempId} /> in NewInvoiceForm, ' +
        'where tempId is generated once at mount (useState(() => uuidv7())). No ' +
        'hidden id input was found in the inline form.',
    ).toEqual(expect.any(String));

    expect(
      idValue && UUIDV7_RE.test(idValue),
      `The hidden id "${idValue}" is not a UUIDv7. The reconcile key must be a ` +
        'real client-generated UUIDv7 (uuidv7()), not a throwaway temp string — ' +
        'a non-id placeholder would flicker on swap because it cannot match the ' +
        "persisted row's key.",
    ).toBe(true);
  });

  it('generates a fresh id per form instance (the key is minted at mount, not constant)', async () => {
    const first = hiddenIdValue(await renderList([]));
    const second = hiddenIdValue(await renderList([]));

    expect(
      first && second && first !== second,
      'Each NewInvoiceForm instance must mint its own reconcile key. Both renders ' +
        `produced the same hidden id (${first}) — a hard-coded constant cannot key ` +
        'a distinct optimistic row. Generate it at mount with useState(() => uuidv7()).',
    ).toBe(true);
  });
});

// Requirement 2 — on success the pending row becomes the persisted row without a
// duplicate (reconciles by shared id key). The flicker-free swap is a DOM-paint
// behavior (hand-verified). The node-observable invariant behind it: the list
// keys every row by its real id and renders each row exactly once as a detail
// link. So when the revalidated row arrives carrying the same id the optimistic
// frame used, React reconciles by that key instead of appending a second row.
describe('existing rows render once each, keyed by their real id, as detail links (req 2)', () => {
  it('renders one detail link per row, pointing at the row’s own id, with no duplication', async () => {
    const rowA = persistedRow({
      id: '019ea01f-bf1f-7c83-a53b-4de169cba1bf',
      number: 'INV-RECON-A',
      customerName: 'Acme Co',
    });
    const rowB = persistedRow({
      id: '019ea020-1111-7c83-a53b-4de169cba1c0',
      number: 'INV-RECON-B',
      customerName: 'Beta Co',
    });

    const markup = await renderList([rowA, rowB]);

    // Each persisted row paints a link to its own detail page — the settled
    // shape an optimistic row reconciles into. The href must carry the row's
    // real id (the same key the optimistic frame was built from).
    expect(
      markup,
      'A settled (non-pending) row must render as a link to its detail page so ' +
        'the reconciled row is navigable. No link to the first row’s detail page ' +
        '(/invoices/<id>) was found — render persisted rows as ' +
        '<Link href={`/invoices/${invoice.id}`}>.',
    ).toContain(`/invoices/${rowA.id}`);
    expect(
      markup,
      'The second row must also render as a detail link keyed by its own id.',
    ).toContain(`/invoices/${rowB.id}`);

    // No duplication: each row id appears exactly once as a detail href. If the
    // list appended optimistic rows by position instead of reconciling by key,
    // a revalidated row would show up twice — this guards that shape.
    const countHref = (id: string) =>
      (markup.match(new RegExp(`/invoices/${id}`, 'g')) ?? []).length;
    expect(
      countHref(rowA.id),
      `The row ${rowA.id} appears ${countHref(rowA.id)} times. Each row must ` +
        'render exactly once — keying the list by invoice.id is what lets a ' +
        'revalidated row replace its optimistic twin instead of duplicating it.',
    ).toBe(1);
    expect(countHref(rowB.id)).toBe(1);
  });
});

// Requirement 3 — on a forced failure the optimistic row disappears and a banner
// shows the action's userMessage. The disappear-on-failure is the automatic
// rollback (a property of the transition's lifetime, hand-verified). The
// node-observable seam: `createInvoice` with `_debug_fail=1` returns an internal
// Result carrying the banner message AFTER the deliberate delay, and persists
// nothing — that returned Result is exactly what the form shows in its banner
// and what ends the transition so useOptimistic drops its update.
describe('the _debug_fail seam returns an internal Result after a delay and persists nothing (req 3)', () => {
  it('returns ok:false / code internal with a userMessage, never inserting the row', async () => {
    const customerId = await findAcmeCustomerId();
    const number = uniqueNumber('debugfail');
    createdNumbers.push(number);
    const formData = createFields(customerId, number, { debugFail: true });

    const started = Date.now();
    const { result, redirectTo, threw } = await runCreate(formData);
    const elapsed = Date.now() - started;

    expect(
      threw,
      'createInvoice threw an unexpected error on the _debug_fail path instead of ' +
        `returning a Result. Error: ${String(threw)}`,
    ).toBeUndefined();

    expect(
      redirectTo,
      'The forced-failure path must NOT redirect — it has to come back so the ' +
        'transition ends and the optimistic row rolls back. createInvoice ' +
        'redirected instead of returning a failure Result. Place the _debug_fail ' +
        'guard after the parse and before the insert, returning err(...) (not ' +
        'redirecting).',
    ).toBeUndefined();

    const r = result as
      | { ok: false; error: { code: string; userMessage: string } }
      | { ok: true }
      | undefined;

    expect(
      r?.ok,
      `The _debug_fail submission must return a failed Result. Got: ` +
        `${JSON.stringify(r)}. Add the guard: if (formData.get('_debug_fail') === ` +
        "'1') { await sleep(500); return err('internal', 'Forced failure for verify'); }.",
    ).toBe(false);

    if (r?.ok !== false) {
      return;
    }

    expect(
      r.error.code,
      'The forced failure must be a non-validation error so the form shows it as a ' +
        "banner, not a field error. Return err('internal', ...) from the " +
        '_debug_fail branch.',
    ).toBe('internal');

    expect(
      r.error.userMessage,
      'The failure Result must carry a userMessage — that string is what the form ' +
        'renders in its rollback banner. Return ' +
        "err('internal', 'Forced failure for verify').",
    ).toEqual(expect.any(String));

    // The brief specifies a deliberate ~500 ms sleep before returning so the
    // pending row is visible long enough to confirm by eye. We assert only that
    // a real delay happened (a generous lower bound), not its exact length.
    expect(
      elapsed,
      `The _debug_fail branch returned in ${elapsed}ms. It must await a short ` +
        'delay (≈500 ms) before returning so the pending row stays on screen long ' +
        'enough to watch it roll back: await new Promise(r => setTimeout(r, 500)).',
    ).toBeGreaterThanOrEqual(300);

    // Nothing was persisted: the guard sits before the insert, so a forced
    // failure leaves no row — which is exactly why the optimistic row must
    // disappear rather than settle.
    expect(
      await rowCountByNumber(number),
      'The _debug_fail path inserted a row. The guard must short-circuit BEFORE ' +
        'the db.insert(...) so a forced failure persists nothing — there is no ' +
        'real row for the optimistic frame to reconcile into.',
    ).toBe(0);
  });

  it('exposes the failure-injection control in the inline form', async () => {
    const markup = await renderList([]);

    // The "Simulate failure" checkbox is the seam the rollback verification
    // drives. Without it the student can't trigger the failure path by hand.
    const hasDebugCheckbox = (markup.match(/<input\b[^>]*>/gi) ?? []).some(
      (tag) => /type="checkbox"/.test(tag) && /name="_debug_fail"/.test(tag),
    );
    expect(
      hasDebugCheckbox,
      'The inline form must render the "Simulate failure" control ' +
        '(<input type="checkbox" name="_debug_fail" value="1" />) so the forced ' +
        'failure can be triggered to watch the optimistic row roll back.',
    ).toBe(true);
  });
});
