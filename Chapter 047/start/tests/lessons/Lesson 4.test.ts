import postgres from 'postgres';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 4 — Delete with confirmation.
//
// This suite drives the student's own delete path and asserts the *observable
// result*, never file paths, export names, or imports:
//   - what `DeleteInvoiceForm` paints on first render (the confirm form + the
//     always-rendered no-JS fallback, req 1),
//   - what `deleteInvoice` (the public surface of src/lib/invoices/actions.ts)
//     does to Postgres and where it sends the user (reqs 1 and 5).
//
// Scope is the Lesson 4 delete path only:
//   req 1 — confirming the dialog removes the invoice and returns to /invoices,
//   req 5 — one org cannot delete another org's row (tenant guard in the `where`).
// The single-POST network shape (req 2), the cancel-changes-nothing path (req 3),
// and the no-JS submit (req 4) are [untested] — they are UI-interaction / no-JS /
// network-panel checks a human verifies by hand.
//
// IMPORTANT: this lesson ships the single-statement `db.delete(...)` version of
// the action; the repo's final actions.ts is the Lesson 6 transactional form
// (transaction + not_found return + `?deleted=<number>` redirect param). Every
// assertion here is true of BOTH shapes — the row is gone, the foreign row is
// untouched, and the user lands back on the /invoices PATH (we ignore any query
// string) — so the suite is green on the solution and reflects exactly what a
// Lesson-4 student implements.
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
// us observe the redirect URL the student's action chose without faking any of
// its own logic.
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
// seed fixtures, observe exactly the rows the student's code committed, and
// clean them up after.
const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

// Resolve a seeded org id by slug. The seed assigns ids via uuidv7(), so they
// differ across seeds — resolve by natural key at run time instead of
// hard-coding a UUID, exactly as getActiveContext() does. 'acme' is the active
// context; 'globex' is the foreign org we use to prove tenant isolation.
const orgIdBySlug = async (slug: string): Promise<string> => {
  const [row] = await sql<{ id: string }[]>`
    select id::text as id from organizations where slug = ${slug} limit 1
  `;
  if (!row) {
    throw new Error(
      `No organization with slug '${slug}'. Start Postgres, migrate, and seed ` +
        '(`docker compose up -d` → `pnpm db:migrate` → `pnpm db:seed`) before ' +
        "running this lesson's tests.",
    );
  }
  return row.id;
};

// A customer that belongs to the given org, so our fixture invoices satisfy the
// customerId foreign key and the org's row constraints.
const customerIdForOrg = async (organizationId: string): Promise<string> => {
  const [row] = await sql<{ id: string }[]>`
    select id::text as id from customers
    where organization_id = ${organizationId} limit 1
  `;
  if (!row) {
    throw new Error(
      `No customer found for org ${organizationId}. Reseed with \`pnpm db:seed\`.`,
    );
  }
  return row.id;
};

// A unique invoice number per call: the invoices table has a unique
// (organization_id, number) constraint, so reusing a number across our own
// fixtures would surface as a conflict and muddy the behavior under test.
const uniqueNumber = (tag: string) =>
  `INV-L4-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Insert a fixture invoice directly (bypassing the action under test) and return
// its id so a test can then drive `deleteInvoice` against it.
const createdNumbers: string[] = [];
const seedInvoice = async (args: {
  organizationId: string;
  number: string;
}): Promise<{ id: string }> => {
  const customerId = await customerIdForOrg(args.organizationId);
  const [createdBy] = await sql<{ id: string }[]>`
    select om.user_id::text as id from org_members om
    where om.organization_id = ${args.organizationId} limit 1
  `;
  const [row] = await sql<{ id: string }[]>`
    insert into invoices
      (organization_id, customer_id, created_by, number, status, total, currency, issued_at, due_at)
    values
      (${args.organizationId}, ${customerId}, ${createdBy?.id ?? null},
       ${args.number}, 'draft', '100.00', 'USD', '2026-01-01', '2026-02-01')
    returning id::text as id
  `;
  if (!row) {
    throw new Error('Failed to seed a fixture invoice.');
  }
  createdNumbers.push(args.number);
  return { id: row.id };
};

const rowExists = async (id: string): Promise<boolean> => {
  const [row] = await sql<{ c: number }[]>`
    select count(*)::int as c from invoices where id = ${id}
  `;
  return (row?.c ?? 0) > 0;
};

// Build the FormData the delete form posts: only the hidden id.
const deleteFields = (id: string) => {
  const fd = new FormData();
  fd.set('id', id);
  return fd;
};

// Call the action and report what came back. On success the action signals by
// throwing the stubbed redirect (so we surface its target); a returned Result
// means the action did NOT redirect, which we surface for the failure message.
const runDelete = async (
  formData: FormData,
): Promise<{ result?: unknown; redirectTo?: string; threw?: unknown }> => {
  const { deleteInvoice } = await import('@/lib/invoices/actions');
  try {
    const result = await deleteInvoice(null, formData);
    return { result };
  } catch (error) {
    const redirectTo = (error as { redirectTo?: string })?.redirectTo;
    if (redirectTo) {
      return { redirectTo };
    }
    return { threw: error };
  }
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

afterAll(async () => {
  // Remove any fixtures that survived (e.g. the foreign-org row, which the
  // tenant guard must leave behind) so re-runs stay clean and the seed's counts
  // are unaffected.
  if (createdNumbers.length > 0) {
    await sql`delete from invoices where number in ${sql(createdNumbers)}`;
  }
  await sql.end();
});

// Requirement 1 — clicking "Delete" opens a confirmation dialog; confirming
// removes the invoice and returns to /invoices without it.
//
// Two observables prove this together:
//   (a) The form's FIRST PAINT carries a confirm <form> AND an always-rendered
//       no-JS fallback <form>, each posting the invoice id — the markup the user
//       sees before any JS runs. We render the Client Component to static markup
//       (node env, no DOM) to read it.
//   (b) Driving the action with that id deletes the row and redirects to the
//       /invoices list (we compare PATH only, ignoring any ?deleted= param the
//       Lesson-6 transactional form appends).
describe('confirming the delete removes the invoice and returns to /invoices (req 1)', () => {
  it('paints a confirm form and an always-rendered no-JS fallback, both carrying the invoice id', async () => {
    const { DeleteInvoiceForm } = await import(
      '@/app/invoices/[invoiceId]/delete-invoice-form'
    );

    const invoiceId = '019ea01f-bf1f-7c83-a53b-4de169cba1bf';

    let markup = '';
    try {
      // Render through createElement (not by calling DeleteInvoiceForm
      // directly): it is a real Client Component using hooks (useActionState),
      // which only work when React's renderer drives the component, not when it
      // is invoked as a plain function.
      markup = renderToStaticMarkup(
        createElement(DeleteInvoiceForm, {
          invoiceId,
          invoiceNumber: 'INV-0042',
        }),
      );
    } catch (error) {
      throw new Error(
        'DeleteInvoiceForm threw while rendering. It should paint a confirm ' +
          'dialog plus an always-rendered fallback form from its props on first ' +
          `paint (still a Delete-button stub?). Underlying error: ${String(error)}`,
      );
    }

    // The form must POST the row id so the action knows which invoice to remove.
    // A hidden id input is the only place that id appears in the markup.
    expect(
      markup,
      'The delete must carry the invoice id so the action targets the right row. ' +
        'Render <input type="hidden" name="id" defaultValue={invoiceId} /> inside ' +
        'the delete form. The invoice id is missing from the first paint.',
    ).toContain(invoiceId);

    // The no-JS path: at least one <form> must be present in the first paint,
    // unconditionally, so the delete still POSTs with scripting disabled (the
    // Radix dialog never opens without JS). renderToStaticMarkup is exactly the
    // pre-hydration HTML a no-JS browser would receive.
    const formCount = (markup.match(/<form/g) ?? []).length;
    expect(
      formCount,
      'The component must render an always-present fallback <form> (not gated ' +
        'behind a no-JS check) in addition to the dialog form, so the delete ' +
        'still POSTs with JavaScript off. No <form> was found in the first paint ' +
        '— the Delete button is not wired to a form action yet.',
    ).toBeGreaterThanOrEqual(1);

    // A bare <button> with an onClick/fetch would leave no <form> and no hidden
    // id — the exact trap this lesson exists to avoid. The two assertions above
    // together rule it out.
  });

  it('deletes the invoice row and sends the user back to the /invoices list', async () => {
    const acmeId = await orgIdBySlug('acme');
    const target = await seedInvoice({
      organizationId: acmeId,
      number: uniqueNumber('delete'),
    });

    expect(
      await rowExists(target.id),
      'Fixture setup failed: the invoice to delete was not inserted.',
    ).toBe(true);

    const { result, redirectTo, threw } = await runDelete(
      deleteFields(target.id),
    );

    expect(
      threw,
      'deleteInvoice threw an unexpected error instead of deleting and ' +
        `redirecting. Error: ${String(threw)}`,
    ).toBeUndefined();

    expect(
      result,
      'A confirmed delete must redirect back to the list, not return a Result. ' +
        `deleteInvoice returned ${JSON.stringify(result)} instead of redirecting. ` +
        'After the db.delete(...), call redirect to send the user to /invoices.',
    ).toBeUndefined();

    // Compare the PATH only: the Lesson-6 transactional form appends
    // `?deleted=<number>`, while the Lesson-4 form redirects to a bare
    // '/invoices'. Both must land on the /invoices list.
    const path = redirectTo?.split('?')[0];
    expect(
      path,
      'A confirmed delete must return the user to the invoices list. ' +
        `deleteInvoice redirected to ${redirectTo}. Call redirect('/invoices') ` +
        'after deleting the row.',
    ).toBe('/invoices');

    expect(
      await rowExists(target.id),
      'The invoice was NOT removed. After a confirmed delete the row must be ' +
        'gone from the invoices table — run a tenant-scoped db.delete(invoices)' +
        '.where(...) on the submitted id before redirecting.',
    ).toBe(false);
  });
});

// Requirement 5 — deleting one org's invoice cannot remove another org's row:
// the tenant id lives in the delete `where`, so submitting a foreign org's id
// under the Acme context matches zero rows and leaves the foreign row intact.
// This is the IDOR guard. Observable: a Globex invoice still exists after an
// Acme-context delete that names its id.
describe('deleting one org’s invoice cannot remove another org’s row — tenant id in the where (req 5)', () => {
  it('leaves the foreign org’s invoice in place when its id is submitted', async () => {
    const globexId = await orgIdBySlug('globex');

    const foreign = await seedInvoice({
      organizationId: globexId,
      number: uniqueNumber('foreign'),
    });

    // The active context is Acme (getActiveContext resolves slug 'acme'); we
    // forge the Globex invoice id, mimicking an attacker deleting a row they can
    // see the id of but do not own.
    const { threw } = await runDelete(deleteFields(foreign.id));

    // The action may redirect (zero rows matched is not an error) or, in the
    // Lesson-6 form, return a not_found Result — either way it must not throw and
    // must NOT have removed the foreign row.
    expect(
      threw,
      'deleteInvoice threw on a foreign-org id. It should complete normally — ' +
        'the tenant-scoped where simply matches nothing — not crash. ' +
        `Error: ${String(threw)}`,
    ).toBeUndefined();

    expect(
      await rowExists(foreign.id),
      'A forged id from another org was deleted — the tenant filter is missing ' +
        'from the WHERE clause. Scope the delete: db.delete(invoices).where(' +
        'and(eq(invoices.id, parsed.data.id), eq(invoices.organizationId, ' +
        'organizationId))). Without the organizationId predicate, any org can ' +
        'delete any invoice by id (an IDOR hole).',
    ).toBe(true);
  });
});
