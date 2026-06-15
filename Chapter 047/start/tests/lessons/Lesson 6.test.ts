import postgres from 'postgres';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 6 — Transactional delete.
//
// This suite drives the student's own `deleteInvoice` (the public surface of
// src/lib/invoices/actions.ts) and asserts the *observable result*, never file
// paths, export names, or imports:
//   - what the action does to Postgres when a real delete runs — the invoice row
//     AND its invoice_lines rows are gone together (req 1),
//   - what survives when the delete is forced to fail mid-transaction — both the
//     invoice and its lines, because the work is one atomic block (req 2),
//   - what the action returns for a missing / other-org id — a not_found Result,
//     not a thrown error, and the foreign row left untouched (req 3),
//   - where the success redirect sends the user and what the provided list page
//     paints from it — `/invoices?deleted=<number>` and the SSR banner text
//     "Invoice <number> deleted" (req 4).
//
// Node env, no DOM. The Sonner toast (req 5) and the "no external call / no
// revalidation inside the callback" rule (req 6) are [untested] — a JS-only
// island and a code-shape rule a human verifies by inspection.
//
// About req 2 (rollback). The action deletes the lines first, then the invoice,
// in one db.transaction. The FK on invoice_lines is ON DELETE CASCADE, so even a
// single-statement delete would remove the lines — that is exactly why "the
// lines are gone" alone does NOT prove the transaction. What proves it is the
// rollback: if the *second* delete (the invoice) fails, the *first* delete (the
// lines) must be undone too. There is no debug seam in deleteInvoice to force
// that from the outside, so we install a real BEFORE DELETE trigger on `invoices`
// for the duration of that one test: the line delete succeeds inside the tx, the
// invoice delete raises, Postgres aborts the transaction, and BOTH rows survive.
// The trigger is dropped in afterAll. This is a genuine database-level rollback,
// driven entirely from the harness, with no change to the student's code.
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
// Outside a Next.js request the real `revalidatePath` throws an internal
// invariant before the action can reach its redirect. We stub both with the same
// contract the action relies on: a no-op cache revalidation, and a `redirect`
// that throws a recognizable sentinel carrying its target (the real `redirect`
// also signals by throwing). This lets us observe the redirect URL the student's
// action chose — `?deleted=<number>` is the whole point of req 4 — without
// faking any of its own logic.
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
// seed fixtures, observe exactly the rows the student's code committed (or rolled
// back), install/drop the rollback trigger, and clean up after.
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

// A unique invoice number per call: the invoices table has a unique
// (organization_id, number) constraint, so reusing a number across our own
// fixtures would surface as a conflict and muddy the behavior under test.
const uniqueNumber = (tag: string) =>
  `INV-L6-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Insert a fixture invoice WITH a couple of line rows directly (bypassing the
// action under test) and return the invoice id. The lines are what makes the
// multi-step delete observable: a real delete must remove them, a rolled-back
// delete must leave them.
const createdNumbers: string[] = [];
const seedInvoiceWithLines = async (args: {
  organizationId: string;
  number: string;
}): Promise<{ id: string }> => {
  const [customer] = await sql<{ id: string }[]>`
    select id::text as id from customers
    where organization_id = ${args.organizationId} limit 1
  `;
  const [member] = await sql<{ id: string }[]>`
    select user_id::text as id from org_members
    where organization_id = ${args.organizationId} limit 1
  `;
  if (!customer) {
    throw new Error(
      `No customer found for org ${args.organizationId}. Reseed with ` +
        '`pnpm db:seed`.',
    );
  }
  const [invoice] = await sql<{ id: string }[]>`
    insert into invoices
      (organization_id, customer_id, created_by, number, status, total, currency, issued_at, due_at)
    values
      (${args.organizationId}, ${customer.id}, ${member?.id ?? null},
       ${args.number}, 'draft', '300.00', 'USD', '2026-01-01', '2026-02-01')
    returning id::text as id
  `;
  if (!invoice) {
    throw new Error('Failed to seed a fixture invoice.');
  }
  await sql`
    insert into invoice_lines (invoice_id, description, quantity, unit_price, position)
    values
      (${invoice.id}, 'Line one', '1', '100.00', 1),
      (${invoice.id}, 'Line two', '2', '100.00', 2)
  `;
  createdNumbers.push(args.number);
  return { id: invoice.id };
};

const invoiceCount = async (id: string): Promise<number> => {
  const [row] = await sql<{ c: number }[]>`
    select count(*)::int as c from invoices where id = ${id}
  `;
  return row?.c ?? 0;
};

const lineCount = async (invoiceId: string): Promise<number> => {
  const [row] = await sql<{ c: number }[]>`
    select count(*)::int as c from invoice_lines where invoice_id = ${invoiceId}
  `;
  return row?.c ?? 0;
};

// Build the FormData the delete form posts: only the hidden id.
const deleteFields = (id: string) => {
  const fd = new FormData();
  fd.set('id', id);
  return fd;
};

// Call the action and report what came back. On success the action signals by
// throwing the stubbed redirect (so we surface its target). A returned Result is
// the not_found / validation branch. Any other throw is a genuine error (and the
// rollback path, which throws the trigger's PostgresError, surfaces here too).
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
  // Defensive: drop the rollback trigger in case a failing test left it behind,
  // then remove any fixtures that survived (e.g. the rolled-back / foreign rows)
  // so re-runs stay clean and the seed's counts are unaffected.
  await sql
    .unsafe(
      'drop trigger if exists _l6_block_invoice_delete on invoices;' +
        'drop function if exists _l6_block_invoice_delete();',
    )
    .catch(() => {});
  if (createdNumbers.length > 0) {
    // Lines hang off invoices via ON DELETE CASCADE, so deleting the invoices
    // sweeps any surviving lines too.
    await sql`delete from invoices where number in ${sql(createdNumbers)}`;
  }
  await sql.end();
});

// Requirement 1 — confirming a delete removes the invoice and all its line rows
// together. Observable: after a real delete the invoice row is gone AND zero
// invoice_lines rows remain for it, and the user is redirected to the list.
describe('a confirmed delete removes the invoice and all its line rows together (req 1)', () => {
  it('deletes both the invoice and its invoice_lines, then redirects to /invoices', async () => {
    const acmeId = await orgIdBySlug('acme');
    const target = await seedInvoiceWithLines({
      organizationId: acmeId,
      number: uniqueNumber('delete'),
    });

    expect(
      await invoiceCount(target.id),
      'Fixture setup failed: the invoice to delete was not inserted.',
    ).toBe(1);
    expect(
      await lineCount(target.id),
      'Fixture setup failed: the invoice was inserted without its line rows.',
    ).toBe(2);

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
      'A confirmed delete must redirect to the list, not return a Result. ' +
        `deleteInvoice returned ${JSON.stringify(result)} instead of redirecting. ` +
        'After the transaction commits, call redirect to send the user back.',
    ).toBeUndefined();

    // Path only here — the exact ?deleted=<number> param is asserted under req 4.
    const path = redirectTo?.split('?')[0];
    expect(
      path,
      'A confirmed delete must return the user to the invoices list. ' +
        `deleteInvoice redirected to ${redirectTo}. Call ` +
        "redirect('/invoices?deleted=' + deletedNumber) after the transaction.",
    ).toBe('/invoices');

    expect(
      await invoiceCount(target.id),
      'The invoice row was NOT removed. The transaction must delete the invoice ' +
        'after deleting its lines — tx.delete(invoices).where(and(id, organizationId)).',
    ).toBe(0);

    expect(
      await lineCount(target.id),
      'The invoice_lines rows were NOT removed. Inside the transaction delete the ' +
        'lines first — tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id)) ' +
        '— before deleting the invoice.',
    ).toBe(0);
  });
});

// Requirement 2 — a forced error after the line delete but before the invoice
// delete leaves BOTH the invoice and its lines intact (rollback). This is the
// constraint the lesson exists to teach: the two deletes are one atomic unit.
//
// We force the failure with a real BEFORE DELETE trigger on `invoices` that
// raises. Inside the action's transaction the line delete runs first (and would
// succeed), then the invoice delete fires the trigger and aborts the whole
// transaction — so Postgres rolls the line delete back too. If the student ran
// the two deletes on `db` instead of `tx` (or outside a transaction), the line
// delete would already be committed by the time the invoice delete fails, and
// the lines would be gone — which this test catches.
describe('a forced failure between the two deletes rolls everything back (req 2)', () => {
  it('leaves both the invoice and its lines intact when the invoice delete aborts', async () => {
    const acmeId = await orgIdBySlug('acme');
    const target = await seedInvoiceWithLines({
      organizationId: acmeId,
      number: uniqueNumber('rollback'),
    });

    // Install the rollback driver: a per-row BEFORE DELETE trigger on invoices
    // that raises. It only affects the invoice delete (the second step); the
    // line delete still runs first inside the action's transaction.
    await sql.unsafe(`
      create or replace function _l6_block_invoice_delete() returns trigger
      language plpgsql as $$ begin
        raise exception 'l6 forced rollback: invoice delete blocked';
      end; $$;
      drop trigger if exists _l6_block_invoice_delete on invoices;
      create trigger _l6_block_invoice_delete before delete on invoices
      for each row execute function _l6_block_invoice_delete();
    `);

    let observed: Awaited<ReturnType<typeof runDelete>>;
    try {
      observed = await runDelete(deleteFields(target.id));
    } finally {
      // Always remove the trigger, even if the assertions below fail, so it
      // never leaks into other tests or the seed.
      await sql.unsafe(
        'drop trigger if exists _l6_block_invoice_delete on invoices;' +
          'drop function if exists _l6_block_invoice_delete();',
      );
    }

    // The transaction aborts, so the action surfaces the error (a genuine
    // failure is what throwing is reserved for) — it must NOT redirect.
    expect(
      observed.redirectTo,
      'The delete redirected even though the invoice delete failed. The two ' +
        'deletes must run inside one db.transaction(async tx => ...) so a failure ' +
        'in the second aborts the first — and redirect must stay OUTSIDE the ' +
        'callback so a rolled-back delete never navigates.',
    ).toBeUndefined();

    // The decisive assertions: nothing was lost. If the line delete had been
    // committed on its own (a stray `db.delete` instead of `tx.delete`, or no
    // transaction at all), the lines would be gone here.
    expect(
      await lineCount(target.id),
      'The invoice_lines rows were deleted even though the invoice delete failed ' +
        '— the line delete was NOT rolled back. Run BOTH deletes on `tx` inside a ' +
        'single db.transaction; a stray `db.delete(...)` opens its own transaction ' +
        'and commits the lines independently, breaking atomicity.',
    ).toBe(2);

    expect(
      await invoiceCount(target.id),
      'The invoice row is missing after a failed delete. The whole transaction ' +
        'must roll back, leaving the invoice in place.',
    ).toBe(1);
  });
});

// Requirement 3 — deleting a missing or other-org invoice returns a not-found
// Result rather than throwing. Two angles: a random non-existent id, and a real
// invoice that belongs to another org (the tenant-isolation case). Both must
// come back as ok:false / code 'not_found' with no throw, and the foreign row
// must be left in place.
describe('deleting a missing or other-org invoice returns not_found without throwing (req 3)', () => {
  it('returns a not_found Result for an id that does not exist', async () => {
    // A well-formed UUID that no row uses (passes the schema's uuid parse, then
    // the tenant-scoped existence read finds nothing).
    const missingId = '00000000-0000-4000-8000-000000000000';

    const { result, redirectTo, threw } = await runDelete(
      deleteFields(missingId),
    );

    expect(
      threw,
      'deleteInvoice threw on a non-existent id. The expected "missing row" case ' +
        'must NOT throw — throwing is reserved for a genuine rollback. Return a ' +
        'discriminated { notFound: true } from the transaction and map it to ' +
        "err('not_found', ...). Error: " +
        String(threw),
    ).toBeUndefined();

    expect(
      redirectTo,
      'deleteInvoice redirected for a non-existent id. A missing row must come ' +
        'back as a not_found Result, not a redirect to the success banner.',
    ).toBeUndefined();

    const r = result as
      | { ok: false; error: { code: string } }
      | { ok: true }
      | undefined;

    expect(
      r?.ok,
      `Deleting a non-existent invoice must return a failed Result. Got: ` +
        `${JSON.stringify(r)}. Inside the transaction, read the row first; when it ` +
        'is missing return { notFound: true as const }, then map that to ' +
        "err('not_found', ...).",
    ).toBe(false);

    if (r?.ok === false) {
      expect(
        r.error.code,
        `The missing-row failure must use the 'not_found' code (got ` +
          `'${r.error.code}'). Map the transaction's { notFound: true } result to ` +
          "err('not_found', 'Invoice not found.').",
      ).toBe('not_found');
    }
  });

  it("returns not_found for another org's invoice and leaves that row in place", async () => {
    // The active context is Acme (getActiveContext resolves slug 'acme'); we
    // forge a real Globex invoice id, mimicking an attacker deleting a row they
    // can see the id of but do not own.
    const globexId = await orgIdBySlug('globex');
    const foreign = await seedInvoiceWithLines({
      organizationId: globexId,
      number: uniqueNumber('foreign'),
    });

    const { result, redirectTo, threw } = await runDelete(
      deleteFields(foreign.id),
    );

    expect(
      threw,
      'deleteInvoice threw on a foreign-org id. The tenant-scoped existence read ' +
        'simply finds nothing — it must return not_found, not crash. Error: ' +
        String(threw),
    ).toBeUndefined();

    expect(
      redirectTo,
      "deleteInvoice redirected for another org's invoice — it treated the foreign " +
        'row as a successful delete. The existence read inside the transaction must ' +
        'be tenant-scoped: and(eq(t.id, id), eq(t.organizationId, organizationId)).',
    ).toBeUndefined();

    const r = result as
      | { ok: false; error: { code: string } }
      | { ok: true }
      | undefined;
    expect(
      r && r.ok === false && r.error.code,
      "A foreign org's invoice must come back as a not_found Result. Got: " +
        `${JSON.stringify(r)}.`,
    ).toBe('not_found');

    // The IDOR guard: the foreign invoice and its lines are untouched.
    expect(
      await invoiceCount(foreign.id),
      "Another org's invoice was deleted — the existence read is missing the " +
        'organizationId predicate (an IDOR hole). Scope it to the active org so a ' +
        'forged id matches nothing.',
    ).toBe(1);
    expect(
      await lineCount(foreign.id),
      "Another org's invoice_lines were deleted. The delete must never run for a " +
        'row outside the active org.',
    ).toBe(2);
  });
});

// Requirement 4 — after a successful delete the list page shows the deleted
// invoice's number in an SSR banner. Two observables chained:
//   (a) the success redirect carries `?deleted=<number>` (the deleted invoice's
//       own number, not its id),
//   (b) rendering the PROVIDED /invoices page with that `deleted` param paints a
//       role="status" banner reading "Invoice <number> deleted" — present in the
//       static markup, i.e. before any JS runs.
describe('a successful delete carries ?deleted=<number> and the list shows an SSR banner (req 4)', () => {
  it('redirects to /invoices?deleted=<number> with the deleted invoice number', async () => {
    const acmeId = await orgIdBySlug('acme');
    const number = uniqueNumber('banner');
    const target = await seedInvoiceWithLines({
      organizationId: acmeId,
      number,
    });

    const { redirectTo, result, threw } = await runDelete(
      deleteFields(target.id),
    );

    expect(
      threw,
      `deleteInvoice threw instead of redirecting. Error: ${String(threw)}`,
    ).toBeUndefined();
    expect(
      result,
      'A successful delete must redirect, not return a Result. Got: ' +
        `${JSON.stringify(result)}.`,
    ).toBeUndefined();

    const url = new URL(redirectTo ?? '', 'http://x');
    expect(
      url.pathname,
      `Expected a redirect to /invoices, got ${redirectTo}.`,
    ).toBe('/invoices');

    // The param value is the invoice NUMBER (what the banner shows), not the id.
    expect(
      url.searchParams.get('deleted'),
      'The success redirect must carry ?deleted=<number> so the list page can ' +
        `render the SSR banner. Redirected to ${redirectTo}. Capture the row's ` +
        "number inside the transaction and redirect('/invoices?deleted=' + number) " +
        '— pass the number, not the id.',
    ).toBe(number);
  });

  it('renders the deleted invoice number in the SSR banner on /invoices', async () => {
    // The list page is provided (not student-written); we render it with the
    // `deleted` param the redirect lands on to confirm the success loop closes.
    // It is an async Server Component: call it with awaited props, then render
    // the returned element to static markup — the pre-hydration HTML a no-JS
    // browser receives.
    const { default: InvoicesPage } = await import('@/app/invoices/page');

    const number = 'INV-0042';
    let markup = '';
    try {
      const element = await InvoicesPage({
        // The page only reads `searchParams` (a Promise of the parsed query);
        // `params` is unused here. Cast to the page's prop shape for the call.
        searchParams: Promise.resolve({ deleted: number }),
        params: Promise.resolve({}),
        // biome-ignore lint/suspicious/noExplicitAny: minimal PageProps stand-in
      } as any);
      markup = renderToStaticMarkup(element);
    } catch (error) {
      throw new Error(
        'Rendering the /invoices page with ?deleted=<number> threw. Make sure the ' +
          'database is up and seeded (the page lists invoices), and that the ' +
          `redirect param is a plain number string. Underlying error: ${String(error)}`,
      );
    }

    expect(
      markup,
      'The list page did not render the success banner text from the ?deleted ' +
        `param. Expected to find "Invoice ${number} deleted" in the SSR markup so ` +
        'the confirmation survives no-JS. Your redirect must carry the invoice ' +
        'number as ?deleted=<number>.',
    ).toContain(`Invoice ${number} deleted`);

    // The banner is a status region so screen readers announce it — and, since
    // it is plain SSR text, it is present without any client JS.
    expect(
      markup,
      'The success confirmation should be an accessible status region (the ' +
        'provided page renders role="status"). It was not found in the SSR markup.',
    ).toContain('role="status"');
  });
});
