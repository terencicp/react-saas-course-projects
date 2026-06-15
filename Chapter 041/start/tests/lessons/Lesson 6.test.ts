import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Lesson 6 — The single-round-trip invoice detail read.
//
// This suite drives the student's own `getInvoiceDetail` (the public surface of
// src/lib/invoices/queries.ts) and asserts on the *returned* invoice object —
// never file paths, export names, or imports. getInvoiceDetail takes the two
// already-typed identifiers the inspector parses from the URL (an
// organizationId and an invoiceId) and resolves "one invoice with its customer
// and its lines" in a single relational read.
//
// It runs against the project's local Docker Postgres, on the schema lesson 3
// migrated in and populated by the lesson 4 seed. The seed is a *prerequisite*
// for this lesson, not under test here, so this suite reads the already-seeded
// data rather than re-running the seed (re-seeding is lesson 4's concern, and
// the student's runSeed may still be the stub). Bring the database up, migrate
// it, and seed it before running:
//
//   docker compose up -d
//   pnpm db:migrate
//   pnpm db:seed
//
// The assertions look up real seeded ids dynamically (the seed mints fresh
// uuidv7 ids each run), so they stay stable across runs without hardcoding.
//
// getInvoiceDetail reaches the DB through `@/db` → `@/env`, and @t3-oss/env
// validates the environment at import time. Vitest does not load .env (only the
// db:* scripts do, via dotenv-cli), so we set the required variables on
// process.env *before* the dynamic import below. Without this the import would
// throw "Invalid environment variables" and every test would error at setup
// rather than fail informatively.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  'postgres://postgres:postgres@localhost:5432/app';

process.env.DATABASE_URL = DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED =
  process.env.DATABASE_URL_UNPOOLED ?? DATABASE_URL;
// The seed is deterministic; pin SEED so the seeded data is the same on every
// run and the ids the assertions below look up stay valid.
process.env.SEED = process.env.SEED ?? '1';

// A read-only auditor connection, separate from the one the query uses, so we
// observe the same database the student's code reads.
const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

// The two identifiers the inspector passes in after parsing the URL.
type DetailArgs = { organizationId: string; invoiceId: string };

// A minimal view of the returned detail — enough to assert tenant scope, the
// joined customer, and the ordered lines without binding to the student's full
// inferred type.
type Detail = {
  id: string;
  organizationId: string;
  customerId: string;
  customer?: { id?: string; name?: string } | null;
  lines?: { position: number }[];
} | null;

// The student's read, loaded after env is set. The holder is typed structurally
// (not by importing the student's types) so the suite stays self-contained; the
// call is cast at the import boundary to bridge the two.
let getInvoiceDetail: (args: DetailArgs) => Promise<Detail>;

// Seeded ids discovered after connecting (the seed mints fresh uuidv7 ids each
// run, so we never hardcode them). orgA / orgB are the two seeded orgs; the
// sample invoice belongs to orgA and has multiple lines so the ordering check is
// not vacuous.
let orgA: { id: string };
let orgB: { id: string };
let sampleInvoice: { id: string; customerId: string; lineCount: number };
let orgBInvoiceId: string;

beforeAll(async () => {
  // Fail loudly and early if the database is unreachable, so a connection
  // problem never masquerades as a missing-feature failure below.
  try {
    await sql`select 1`;
  } catch (cause) {
    throw new Error(
      `Could not reach Postgres at ${DATABASE_URL}. Start the database with ` +
        '`docker compose up -d` and apply the migration with `pnpm db:migrate` ' +
        "before running this lesson's tests.",
      { cause },
    );
  }

  const queries = await import('@/lib/invoices/queries');
  // The student's getInvoiceDetail is typed against its inferred detail type;
  // bridge to this suite's structural type at the import boundary so the
  // assertions can read customer/lines without importing the student's types.
  getInvoiceDetail =
    queries.getInvoiceDetail as unknown as typeof getInvoiceDetail;

  // Two distinct seeded orgs, each with invoices — the cross-org guard needs an
  // invoice id that lives under a *different* org than the one we pass.
  const orgs = await sql<{ id: string; n: number }[]>`
    select o.id, count(i.id)::int as n
    from organizations o
    left join invoices i on i.organization_id = o.id
    group by o.id
    having count(i.id) > 0
    order by n desc
  `;
  if (orgs.length < 2 || !orgs[0] || !orgs[1]) {
    throw new Error(
      'Expected two seeded organizations, each with invoices, before this ' +
        "lesson's tests can run. The database is not seeded — run `pnpm db:seed` " +
        '(after `pnpm db:migrate`) to populate it, then re-run the tests.',
    );
  }
  orgA = { id: orgs[0].id };
  orgB = { id: orgs[1].id };

  // A real invoice in orgA that has more than one line, so asserting the lines
  // come back ordered by position actually exercises the ordering.
  const [sample] = await sql<
    { id: string; customer_id: string; line_count: number }[]
  >`
    select i.id, i.customer_id, count(l.id)::int as line_count
    from invoices i
    join invoice_lines l on l.invoice_id = i.id
    where i.organization_id = ${orgA.id}
    group by i.id
    having count(l.id) > 1
    order by i.id
    limit 1
  `;
  if (!sample) {
    throw new Error(
      'Could not find a seeded invoice with more than one line item to test ' +
        'against. The seed (lesson 4) must populate invoices with line items ' +
        'before this lesson can be verified.',
    );
  }
  sampleInvoice = {
    id: sample.id,
    customerId: sample.customer_id,
    lineCount: sample.line_count,
  };

  // An invoice that lives under the *other* org — the id an attacker might guess.
  const [other] = await sql<{ id: string }[]>`
    select id from invoices where organization_id = ${orgB.id} limit 1
  `;
  if (!other) {
    throw new Error(
      'The second organization has no invoices to use for the cross-org guard ' +
        'test. Re-seed the database with `pnpm db:seed`.',
    );
  }
  orgBInvoiceId = other.id;
}, 120_000);

afterAll(async () => {
  await sql.end();
});

// Requirement 1 — clicking an invoice loads its header, its customer, and its
// line items ordered by position. The detail read returns the matching invoice
// with a joined customer object and its lines in ascending position order.
describe('loads the invoice with its customer and position-ordered lines (req 1)', () => {
  it('returns the matching invoice for an in-org id', async () => {
    const detail = await getInvoiceDetail({
      organizationId: orgA.id,
      invoiceId: sampleInvoice.id,
    });

    expect(
      detail,
      'getInvoiceDetail returned null for an invoice that exists in the passed organization. The detail read has not been implemented — it still returns the null stub.',
    ).not.toBeNull();
    expect(
      detail?.id,
      'The returned invoice is not the one that was asked for. getInvoiceDetail must match on the invoiceId in its query `where`.',
    ).toBe(sampleInvoice.id);
    expect(
      detail?.organizationId,
      'The returned invoice belongs to a different organization than the one requested. The query must also match on organizationId.',
    ).toBe(orgA.id);
  });

  it('includes the invoice’s customer object', async () => {
    const detail = await getInvoiceDetail({
      organizationId: orgA.id,
      invoiceId: sampleInvoice.id,
    });

    expect(
      detail?.customer,
      'The detail has no customer attached. The relational read must include the customer (with: { customer: true }) so the panel can render the customer block — not a separate getCustomer lookup.',
    ).toBeTruthy();
    expect(
      detail?.customer?.id,
      'The attached customer is not this invoice’s customer. The `customer` relation must resolve to the invoice’s own customerId.',
    ).toBe(sampleInvoice.customerId);
  });

  it('returns the lines in ascending position order', async () => {
    const detail = await getInvoiceDetail({
      organizationId: orgA.id,
      invoiceId: sampleInvoice.id,
    });

    const positions = (detail?.lines ?? []).map((l) => l.position);
    expect(
      positions.length,
      'No line items came back with the invoice. The relational read must include the lines (with: { lines: ... }) so they arrive in the same result.',
    ).toBeGreaterThan(1);

    const sorted = [...positions].sort((a, b) => a - b);
    expect(
      positions,
      'The line items came back in an unspecified order. Row order from a join is not guaranteed — the lines must be ordered explicitly by position (orderBy: asc(position)).',
    ).toEqual(sorted);
  });
});

// Requirement 2 — the tenant guard. Pairing one org's organizationId with
// another org's invoiceId returns no invoice (the empty state), never the
// cross-org row. This is the IDOR fix and the lesson's reason for existing.
describe('never returns a cross-org invoice (req 2)', () => {
  it('returns null when the invoiceId belongs to a different org', async () => {
    const detail = await getInvoiceDetail({
      organizationId: orgA.id,
      invoiceId: orgBInvoiceId,
    });

    expect(
      detail,
      'A guessed invoice id from another organization returned that invoice. The tenant guard must live inside the query `where` (eq(organizationId, ...)), so a cross-org id matches nothing. Loading the invoice and then checking its organizationId is the IDOR leak this lesson exists to prevent.',
    ).toBeNull();
  });

  it('returns the same invoice only under its own org', async () => {
    // Sanity: the orgB invoice does load when paired with its own org, proving
    // the null above is the guard at work, not a missing row.
    const ownOrg = await getInvoiceDetail({
      organizationId: orgB.id,
      invoiceId: orgBInvoiceId,
    });

    expect(
      ownOrg?.id,
      'The orgB invoice did not load even under its own organization. The cross-org null must come from the organizationId guard, not from the invoice being absent — check that getInvoiceDetail matches an in-org id correctly.',
    ).toBe(orgBInvoiceId);
  });
});

// Requirement 3 — the nested `with` resolves the customer and the lines in a
// single result. A detail read for an in-org invoiceId returns that invoice's
// customer and the correct set of line items together (not three lookups).
describe('resolves customer and lines in one result (req 3)', () => {
  it('returns the exact set of line items the database holds for the invoice', async () => {
    const detail = await getInvoiceDetail({
      organizationId: orgA.id,
      invoiceId: sampleInvoice.id,
    });

    expect(
      detail,
      'getInvoiceDetail returned null for an in-org invoice — implement the read first.',
    ).not.toBeNull();

    const returnedCount = (detail?.lines ?? []).length;
    expect(
      returnedCount,
      `The nested read returned ${returnedCount} line items but the database holds ${sampleInvoice.lineCount} for this invoice. The lines relation must come back complete in the one result, not partially or as a separate query.`,
    ).toBe(sampleInvoice.lineCount);

    // The customer must arrive in the same call — a single round trip, not a
    // follow-up getCustomer lookup.
    expect(
      detail?.customer?.id,
      'The customer was not present in the same result as the lines. Both the customer and the lines must be satisfied by one relational read (the nested `with`), not by separate lookups.',
    ).toBe(sampleInvoice.customerId);
  });
});
