import postgres from 'postgres';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 3 — Edit an invoice.
//
// This suite drives the student's own update path and asserts the *observable
// result*, never file paths, export names, or imports:
//   - what `EditInvoiceForm` paints on first render (the prefill, req 1),
//   - what `updateInvoice` (the public surface of src/lib/invoices/actions.ts)
//     returns and what row it leaves in Postgres (reqs 2–4).
//
// Scope is the Lesson 3 edit path only:
//   req 1 — opening the form shows it prefilled with the invoice's values,
//   req 2 — a valid save persists in place and returns ok({ id }), no redirect,
//   req 3 — one org cannot edit another org's row (tenant guard in the `where`),
//   req 4 — a duplicate number surfaces as a form-level conflict, not a field
//           error.
// The invalid-edit field-message + value-echo behavior (req 5) is [untested] —
// it leans on the same React-19 form-reset mechanic lesson 2 owns.
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
// Outside a Next.js request `revalidatePath` throws an internal invariant, and
// the edit action must NOT redirect at all — so we stub both. `redirect` throws
// a recognizable sentinel carrying its target (the real one also signals by
// throwing) so that if the student wrongly redirects on save we observe it as a
// redirect rather than a thrown error and can report the exact mistake.
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
  `INV-L3-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Insert a fixture invoice directly (bypassing the action under test) and return
// its id + number so a test can then drive `updateInvoice` against it.
const createdNumbers: string[] = [];
const seedInvoice = async (args: {
  organizationId: string;
  number: string;
  total?: string;
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
       ${args.number}, 'draft', ${args.total ?? '100.00'}, 'USD',
       '2026-01-01', '2026-02-01')
    returning id::text as id
  `;
  if (!row) {
    throw new Error('Failed to seed a fixture invoice.');
  }
  createdNumbers.push(args.number);
  return { id: row.id };
};

// Build the FormData the edit form posts: the create fields plus the hidden id.
const editFields = (args: {
  id: string;
  customerId: string;
  number: string;
  total?: string;
}) => {
  const fd = new FormData();
  fd.set('id', args.id);
  fd.set('customerId', args.customerId);
  fd.set('number', args.number);
  fd.set('status', 'sent');
  fd.set('total', args.total ?? '250.00');
  fd.set('issuedAt', '2026-03-01');
  fd.set('dueAt', '2026-04-01');
  fd.set('currency', 'USD');
  return fd;
};

// Call the action and report what came back: a returned `Result` (the expected
// shape — ok on a valid save, err on conflict/validation) or a redirect target
// (the wrong branch for edit, which we surface so the failure message can name
// it).
const runUpdate = async (
  formData: FormData,
): Promise<{ result?: unknown; redirectTo?: string; threw?: unknown }> => {
  const { updateInvoice } = await import('@/lib/invoices/actions');
  try {
    const result = await updateInvoice(null, formData);
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
  // Remove the fixtures this suite inserted so re-runs stay clean and the seed's
  // counts are unaffected.
  if (createdNumbers.length > 0) {
    await sql`delete from invoices where number in ${sql(createdNumbers)}`;
  }
  await sql.end();
});

// Requirement 1 — opening /invoices/[invoiceId] shows the edit form prefilled
// with the invoice's current values. Observable on first paint: the form's
// rendered markup carries the invoice's number, total, currency, status, and
// formatted dates as the inputs' initial (default) values, plus the id as a
// hidden field. We render the Client Component to static markup (node env, no
// DOM) and read what the first paint would show the user.
describe('opening the edit form shows it prefilled with the invoice values (req 1)', () => {
  it('renders the current number, total, currency and a hidden id from the invoice prop', async () => {
    const { EditInvoiceForm } = await import(
      '@/app/invoices/[invoiceId]/edit-invoice-form'
    );

    const invoice = {
      id: '019ea01f-bf1f-7c83-a53b-4de169cba1bf',
      organizationId: '019ea01f-0000-0000-0000-000000000001',
      customerId: '019ea01f-1111-1111-1111-111111111111',
      createdBy: null,
      number: 'INV-PREFILL-1',
      status: 'sent' as const,
      total: '1459.36',
      currency: 'EUR',
      // Stored as Date objects (the timestamp columns map to Date); the form
      // formats them to yyyy-mm-dd for the date inputs.
      issuedAt: new Date('2026-05-10T00:00:00.000Z'),
      dueAt: new Date('2026-06-09T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      customer: {
        id: '019ea01f-1111-1111-1111-111111111111',
        name: 'A Customer',
      },
      lines: [],
    };

    let markup = '';
    try {
      // Render through createElement (not by calling EditInvoiceForm directly):
      // the form is a real Client Component that uses hooks (useActionState),
      // and those only work when React's renderer drives the component, not when
      // it is invoked as a plain function.
      markup = renderToStaticMarkup(
        createElement(EditInvoiceForm, {
          // biome-ignore lint/suspicious/noExplicitAny: fixture stands in for InvoiceDetail
          invoice: invoice as any,
          customers: [invoice.customer],
        }),
      );
    } catch (error) {
      throw new Error(
        'EditInvoiceForm threw while rendering. It should render a prefilled ' +
          'form from the `invoice` prop on first paint (no field cluster yet?). ' +
          `Underlying error: ${String(error)}`,
      );
    }

    expect(
      markup,
      'The edit form must paint with the invoice number as the field default. ' +
        'Seed the number input with defaultValue from the `invoice` prop (uncontrolled, not value).',
    ).toContain('INV-PREFILL-1');

    expect(
      markup,
      'The edit form must paint with the invoice total prefilled. Seed the total ' +
        'input with defaultValue={String(invoice.total)} so the current amount shows.',
    ).toContain('1459.36');

    expect(
      markup,
      'The edit form must paint with the invoice currency prefilled (here EUR). ' +
        'A blank or hardcoded currency means the input is not seeded from the prop.',
    ).toContain('EUR');

    expect(
      markup,
      'The edit form must carry the invoice id as a hidden input so the update ' +
        'targets the right row. Render <input type=hidden name="id" defaultValue={invoice.id} />.',
    ).toContain('019ea01f-bf1f-7c83-a53b-4de169cba1bf');

    expect(
      markup,
      'The date inputs must show the invoice dates as yyyy-mm-dd defaults. The ' +
        'issuedAt date 2026-05-10 is not in the markup — format invoice.issuedAt ' +
        'with an en-CA + UTC Intl.DateTimeFormat and seed it as defaultValue.',
    ).toContain('2026-05-10');
  });
});

// Requirement 2 — saving valid changes persists them in place and the action
// returns ok({ id }) WITHOUT redirecting (the user stays on the form;
// revalidatePath re-fetches the Server Component). Observable: a returned ok
// Result whose id is the edited row, no redirect, and the DB row now holds the
// new values.
describe('a valid edit saves in place and returns ok({ id }) without redirecting (req 2)', () => {
  it('updates the row and returns ok with the same id, no redirect', async () => {
    const acmeId = await orgIdBySlug('acme');
    const customerId = await customerIdForOrg(acmeId);
    const original = await seedInvoice({
      organizationId: acmeId,
      number: uniqueNumber('save'),
      total: '100.00',
    });

    const newNumber = uniqueNumber('save-edited');
    createdNumbers.push(newNumber);

    const { result, redirectTo, threw } = await runUpdate(
      editFields({
        id: original.id,
        customerId,
        number: newNumber,
        total: '777.77',
      }),
    );

    expect(
      threw,
      'updateInvoice threw an unexpected error on a valid edit. A valid save must ' +
        `update the row and return ok, not throw. Error: ${String(threw)}`,
    ).toBeUndefined();

    expect(
      redirectTo,
      'The edit action must NOT redirect on success — the user stays on the form ' +
        'and revalidatePath re-fetches fresh defaults. updateInvoice redirected to ' +
        `${redirectTo}. Return ok({ id }) instead of calling redirect().`,
    ).toBeUndefined();

    const r = result as { ok: boolean; data?: { id: string } } | undefined;
    expect(
      r?.ok,
      `A valid edit must return a successful Result. Got: ${JSON.stringify(r)}. ` +
        'Update the row, then return ok({ id: parsed.data.id }).',
    ).toBe(true);

    expect(
      r?.data?.id,
      'The successful Result must carry the edited invoice id so the form knows ' +
        'which row was saved. Return ok({ id: parsed.data.id }).',
    ).toBe(original.id);

    const [row] = await sql<{ number: string; total: string }[]>`
      select number, total::text as total from invoices where id = ${original.id}
    `;
    expect(
      row?.total,
      'The edit did not persist. After a valid save the row in the database must ' +
        'hold the new values — db.update(invoices).set(parsed.data).where(...).',
    ).toBe('777.77');
    expect(row?.number).toBe(newNumber);
  });
});

// Requirement 3 — editing cannot reach across orgs: the tenant filter lives in
// the `where` clause, so submitting another org's invoice id under the Acme
// context matches zero rows and leaves the foreign row untouched. This is the
// IDOR guard. Observable: a Globex invoice's value is unchanged after an
// Acme-context update that names its id.
describe('one org cannot edit another org’s invoice — tenant guard in the where (req 3)', () => {
  it('leaves the foreign org’s row untouched when its id is submitted', async () => {
    const globexId = await orgIdBySlug('globex');
    const acmeCustomerId = await customerIdForOrg(await orgIdBySlug('acme'));

    const foreignNumber = uniqueNumber('foreign');
    const foreign = await seedInvoice({
      organizationId: globexId,
      number: foreignNumber,
      total: '500.00',
    });

    // The active context is Acme (getActiveContext resolves slug 'acme'); we
    // forge the Globex invoice id, mimicking an attacker editing a row they can
    // see the id of but do not own.
    const { result, redirectTo } = await runUpdate(
      editFields({
        id: foreign.id,
        customerId: acmeCustomerId,
        number: uniqueNumber('forged'),
        total: '999.99',
      }),
    );

    // The action may report ok (zero rows matched is not an error) — what matters
    // is that the foreign row did not change.
    expect(
      redirectTo,
      'The edit action must not redirect; here it also must not mutate the foreign ' +
        `row. It redirected to ${redirectTo}.`,
    ).toBeUndefined();

    const [row] = await sql<{ total: string; number: string }[]>`
      select total::text as total, number from invoices where id = ${foreign.id}
    `;
    expect(
      row?.total,
      'A forged id from another org must match ZERO rows — the tenant filter ' +
        'belongs in the WHERE clause: where(and(eq(id, parsed.data.id), ' +
        'eq(organizationId, organizationId))). The Globex row was modified, which ' +
        'means the update is not scoped by organizationId (an IDOR hole).',
    ).toBe('500.00');
    expect(
      row?.number,
      'The foreign invoice number changed — the update reached a row it should ' +
        'never touch. Scope the update by organizationId in the WHERE clause.',
    ).toBe(foreignNumber);

    // Anti-vacuity: prove the result wasn't a generic crash that happened to
    // leave the row alone. The action should still complete (ok or a clean err),
    // not throw.
    expect(
      (result as { ok?: boolean } | undefined)?.ok,
      'updateInvoice did not return a Result for the foreign-id case. It should ' +
        'complete normally (the where simply matches nothing), not throw.',
    ).toBeDefined();
  });
});

// Requirement 4 — setting an invoice's number to one already used by another
// invoice in the SAME org surfaces as a form-level conflict, not a field error.
// The unique constraint is on the (org, number) composite, so it cannot be
// attributed to a single field. Observable: a failed Result with code
// 'conflict' (so the form shows a banner) and no per-field 'number' error.
describe('a duplicate number in the same org surfaces as a form-level conflict, not a field error (req 4)', () => {
  it('returns ok:false with code "conflict" and no number fieldError', async () => {
    const acmeId = await orgIdBySlug('acme');
    const customerId = await customerIdForOrg(acmeId);

    const takenNumber = uniqueNumber('taken');
    await seedInvoice({ organizationId: acmeId, number: takenNumber });

    const editTarget = await seedInvoice({
      organizationId: acmeId,
      number: uniqueNumber('edit-target'),
    });

    // Try to rename editTarget to a number already taken by another Acme invoice.
    const { result, redirectTo } = await runUpdate(
      editFields({ id: editTarget.id, customerId, number: takenNumber }),
    );

    expect(
      redirectTo,
      'A duplicate-number save must come back to the form with a banner, not ' +
        `redirect. updateInvoice redirected to ${redirectTo}.`,
    ).toBeUndefined();

    const r = result as
      | {
          ok: false;
          error: { code: string; fieldErrors?: Record<string, string[]> };
        }
      | { ok: true }
      | undefined;

    expect(
      r?.ok,
      `A duplicate number must return a failed Result. Got: ${JSON.stringify(r)}. ` +
        'Catch the unique-violation from db.update and return err("conflict", ...).',
    ).toBe(false);

    if (r?.ok !== false) {
      return;
    }

    expect(
      r.error.code,
      'A duplicate (org, number) is a conflict, not a validation failure. The ' +
        "Result code must be 'conflict' so the form renders a form-level banner " +
        '(state.error.code !== "validation"). Map isUniqueViolation(e) to ' +
        'err("conflict", ...) in the catch.',
    ).toBe('conflict');

    expect(
      r.error.fieldErrors?.number,
      'The conflict must NOT be attached to the number field — the unique ' +
        'constraint is on the (org, number) composite, so it has no single owning ' +
        'field. A "number" fieldError here would make the form show an inline ' +
        'field error instead of the banner.',
    ).toBeUndefined();
  });
});
