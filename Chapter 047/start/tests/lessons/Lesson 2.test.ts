import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 2 — Create an invoice.
//
// This suite drives the student's own `createInvoice` server action (the public
// surface of src/lib/invoices/actions.ts) and asserts the *observable result*:
// what it returns to the form layer (the `Result`), what it redirects to, and
// what row it leaves in Postgres. It never asserts file paths, export names, or
// imports — only the behavior the action produces.
//
// Scope is the Lesson 2 create path only: the valid-submit insert + redirect
// (req 1) and the validation `Result` shape on a bad submit (reqs 3, 4).
// Optimistic create, `_debug_fail`, edit, and delete are later lessons and are
// not exercised here.
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
// observe exactly the row the student's code committed and clean it up after.
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
// (organization_id, number) constraint, so reusing a number would surface as a
// conflict rather than the create-path behavior under test.
const uniqueNumber = (tag: string) =>
  `INV-L2-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const baseFields = (customerId: string, number: string) => {
  const fd = new FormData();
  fd.set('customerId', customerId);
  fd.set('number', number);
  fd.set('status', 'draft');
  fd.set('total', '100.00');
  fd.set('issuedAt', '2026-01-01');
  fd.set('dueAt', '2026-02-01');
  fd.set('currency', 'USD');
  return fd;
};

// Call the action and report what came back: a returned `Result` (validation /
// conflict branches) or the redirect target (the success branch, which the
// action signals by throwing the stubbed redirect).
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

const createdNumbers: string[] = [];

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
  // Remove the rows this suite inserted so re-runs stay clean and the seed's
  // counts are unaffected.
  if (createdNumbers.length > 0) {
    await sql`delete from invoices where number in ${sql(createdNumbers)}`;
  }
  await sql.end();
});

// Requirement 1 — a valid submission writes the row and redirects to its detail
// page; the new row appears in the invoices table.
describe('a valid submission persists the invoice and redirects to its detail page (req 1)', () => {
  it('redirects to /invoices/[newId] and writes a matching row', async () => {
    const customerId = await findAcmeCustomerId();
    const number = uniqueNumber('ok');
    createdNumbers.push(number);

    const { result, redirectTo, threw } = await runCreate(
      baseFields(customerId, number),
    );

    expect(
      threw,
      `createInvoice threw an unexpected error instead of redirecting. A valid ` +
        `submission must insert the row and redirect, not throw. Error: ${String(threw)}`,
    ).toBeUndefined();

    expect(
      result,
      `On a valid submission createInvoice must redirect rather than return a ` +
        `Result. It returned: ${JSON.stringify(result)}. Check that the success ` +
        `branch calls redirect('/invoices/' + row.id) instead of returning ok(...).`,
    ).toBeUndefined();

    expect(
      redirectTo,
      'A valid submission must redirect to the new invoice. createInvoice never ' +
        'called redirect — make sure the success branch redirects after the insert.',
    ).toMatch(/^\/invoices\/[0-9a-f-]{36}$/);

    const newId = redirectTo?.replace('/invoices/', '');
    const rows = await sql<
      {
        id: string;
        number: string;
        total: string;
        status: string;
        currency: string;
      }[]
    >`
      select id::text as id, number, total::text as total, status::text as status, currency
      from invoices
      where number = ${number}
    `;

    expect(
      rows.length,
      'The submitted invoice was not found in the database. createInvoice must ' +
        'insert the parsed values into the invoices table before redirecting.',
    ).toBe(1);

    const row = rows[0];
    expect(
      row?.id,
      'The redirect target must point at the row that was just inserted. The ' +
        'id in the redirect URL does not match the persisted row — redirect to ' +
        "the inserted row's returned id (db.insert(...).returning({ id })).",
    ).toBe(newId);
    expect(
      row?.total,
      'The persisted total must match what was submitted (kept as a string for ' +
        'the numeric column).',
    ).toBe('100.00');
    expect(
      row?.status,
      'The persisted status must match the submitted value.',
    ).toBe('draft');
  });
});

// Requirement 3 — submitting with `total` blank and a malformed `dueAt`
// re-renders with a message under each offending field, sourced from the
// action's Result. Observable at the action: a validation Result whose
// fieldErrors carry an entry for each offending field.
describe('an invalid submission returns a validation Result flagging the offending fields (req 3)', () => {
  it('returns ok:false with a fieldError for both total and dueAt', async () => {
    const customerId = await findAcmeCustomerId();
    const formData = baseFields(customerId, uniqueNumber('bad'));
    formData.set('total', '');
    formData.set('dueAt', 'not-a-date');

    const { result, redirectTo } = await runCreate(formData);

    expect(
      redirectTo,
      'An invalid submission must NOT redirect — it has to come back to the form ' +
        'with errors. createInvoice redirected instead of returning a validation ' +
        'Result. safeParse the FormData first and return err(...) on failure.',
    ).toBeUndefined();

    const r = result as
      | {
          ok: false;
          error: { code: string; fieldErrors?: Record<string, string[]> };
        }
      | { ok: true };

    expect(
      r?.ok,
      `An invalid submission must return a failed Result. Got: ${JSON.stringify(r)}. ` +
        'Parse the FormData with safeParse and return err(...) when it fails.',
    ).toBe(false);

    if (r?.ok !== false) {
      return;
    }

    expect(
      r.error.code,
      'A bad submission is a validation failure — the Result error code must be ' +
        "'validation' so the form treats it as field errors, not a banner.",
    ).toBe('validation');

    expect(
      r.error.fieldErrors?.total?.[0],
      'A blank total must produce a message under the total field. The Result ' +
        "fieldErrors must include a 'total' entry — build them with " +
        'z.flattenError(parsed.error).fieldErrors.',
    ).toEqual(expect.any(String));

    expect(
      r.error.fieldErrors?.dueAt?.[0],
      'A malformed dueAt must produce a message under the dueAt field. The Result ' +
        "fieldErrors must include a 'dueAt' entry — build them with " +
        'z.flattenError(parsed.error).fieldErrors.',
    ).toEqual(expect.any(String));
  });
});

// Requirement 4 — on that validation failure the fields that WERE valid are not
// flagged, so the form keeps their typed values and re-enables submit. The
// action's contribution is a Result whose fieldErrors name only the offending
// fields, leaving the valid ones untouched.
describe('a validation failure flags only the offending fields, leaving the valid ones untouched (req 4)', () => {
  it('does not report fieldErrors for the fields that were valid', async () => {
    const customerId = await findAcmeCustomerId();
    const formData = baseFields(customerId, uniqueNumber('partial'));
    // customerId, number, status, currency, issuedAt are all valid; only these
    // two are wrong.
    formData.set('total', '');
    formData.set('dueAt', 'not-a-date');

    const { result } = await runCreate(formData);
    const r = result as
      | {
          ok: false;
          error: { code: string; fieldErrors?: Record<string, string[]> };
        }
      | { ok: true }
      | undefined;

    expect(
      r?.ok,
      'The partially-invalid submission must come back as a failed validation ' +
        'Result so the form can re-render with only the bad fields flagged.',
    ).toBe(false);

    if (r?.ok !== false) {
      return;
    }

    // Anchor on the validation branch so this check is meaningful: a generic
    // 'internal' error carries no fieldErrors and would pass the loop below
    // vacuously. The offending-field flagging only matters once the action
    // actually parses and reports field errors.
    expect(
      r.error.code,
      'The partially-invalid submission must be reported as a validation failure ' +
        "(code 'validation') with per-field errors, not a generic error. Parse " +
        "the FormData with safeParse and return err('validation', ...) on failure.",
    ).toBe('validation');

    const fieldErrors = r.error.fieldErrors ?? {};
    for (const validField of [
      'customerId',
      'number',
      'status',
      'currency',
      'issuedAt',
    ]) {
      expect(
        fieldErrors[validField],
        `'${validField}' was submitted with a valid value, so it must NOT appear ` +
          'in fieldErrors — only the offending fields should be flagged. A stray ' +
          'entry here means the schema is rejecting a value it should accept.',
      ).toBeUndefined();
    }
  });
});
