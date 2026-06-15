import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Lesson 4 — A deterministic, idempotent seed for two orgs.
//
// This suite drives the student's own `runSeed` (the public surface of
// scripts/seed.ts) and then asserts the *observable Postgres state* it leaves
// behind — never file paths, export names, or imports. It reads the database
// back through a plain `postgres` connection, the same way an auditor would
// confirm what actually landed. It targets the local Docker Postgres the
// project's db:* scripts use, against the schema lesson 3 migrated in.
//
// Before running it, make sure the database is up and migrated:
//
//   docker compose up -d
//   pnpm db:migrate
//
// The suite seeds itself: it calls runSeed inside beforeAll (twice, for the
// idempotency/determinism checks), so it never assumes prior state. There is no
// need to run `pnpm db:seed` first.
//
// runSeed reaches the DB through `@/db` → `@/env`, and @t3-oss/env validates the
// environment at import time. Vitest does not load .env (only the db:* scripts
// do, via dotenv-cli), so we set the required variables on process.env *before*
// the dynamic import below. Without this the import would throw "Invalid
// environment variables" and every test would error at setup rather than fail
// informatively.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  'postgres://postgres:postgres@localhost:5432/app';

process.env.DATABASE_URL = DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED =
  process.env.DATABASE_URL_UNPOOLED ?? DATABASE_URL;
// A fixed seed is the determinism contract: the same number must yield the same
// data on every run. We pin it here so the determinism check below is meaningful.
process.env.SEED = process.env.SEED ?? '1';

// A read-only auditor connection, separate from the one the seed uses, so we
// observe exactly the rows the student's code committed.
const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

const tableCounts = async () => {
  const [row] = await sql<
    {
      organizations: number;
      users: number;
      org_members: number;
      customers: number;
      invoices: number;
      invoice_lines: number;
    }[]
  >`
    select
      (select count(*)::int from organizations) as organizations,
      (select count(*)::int from users)         as users,
      (select count(*)::int from org_members)   as org_members,
      (select count(*)::int from customers)     as customers,
      (select count(*)::int from invoices)      as invoices,
      (select count(*)::int from invoice_lines) as invoice_lines
  `;
  // This is a single-row aggregate query, so a missing row means the connection
  // or schema is broken — surface that loudly rather than carrying undefined.
  if (!row) {
    throw new Error('Could not read table counts — is the schema migrated?');
  }
  return row;
};

// A stable sample of one invoice for the determinism check: the lowest number
// is deterministic across runs only if the seed itself is deterministic.
const sampleInvoice = async () => {
  const [row] = await sql<{ id: string; number: string }[]>`
    select id, number from invoices order by number asc limit 1
  `;
  return row;
};

// Captured once, immediately after the first seed, so the read-only assertions
// (reqs 1–4, 7) describe a single known run even though beforeAll seeds twice.
let firstCounts: Awaited<ReturnType<typeof tableCounts>>;
let firstInvoice: Awaited<ReturnType<typeof sampleInvoice>>;
// Captured after a second seed with the same SEED, for reqs 5 and 6.
let secondCounts: Awaited<ReturnType<typeof tableCounts>>;
let secondInvoice: Awaited<ReturnType<typeof sampleInvoice>>;

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

  const { runSeed } = await import('@/../scripts/seed');

  // First run: fills an empty (or previously-seeded) database. reset() inside
  // runSeed clears prior rows, so we can run it repeatedly without piling up.
  await runSeed();
  firstCounts = await tableCounts();
  firstInvoice = await sampleInvoice();

  // Second run, same SEED: idempotency means the counts must match, determinism
  // means the PRNG-driven data (the sampled invoice's number) must be reproduced.
  await runSeed();
  secondCounts = await tableCounts();
  secondInvoice = await sampleInvoice();
}, 120_000);

afterAll(async () => {
  await sql.end();
});

// Requirement 1 — exactly 2 organizations and 4 users.
describe('seeds exactly two organizations and four users (req 1)', () => {
  it('inserts exactly two organizations', () => {
    expect(
      firstCounts.organizations,
      'After seeding there must be exactly 2 organizations (Acme and Globex). Got a different count — check the organizations insert in runSeed.',
    ).toBe(2);
  });

  it('inserts exactly four users', () => {
    expect(
      firstCounts.users,
      'After seeding there must be exactly 4 users. Got a different count — check the users insert in runSeed.',
    ).toBe(4);
  });
});

// Requirement 2 — 5 org_members, with exactly one user in both organizations.
describe('models overlapping membership: five members, one user in both orgs (req 2)', () => {
  it('inserts exactly five org_members', () => {
    expect(
      firstCounts.org_members,
      'After seeding there must be exactly 5 org_members. Got a different count — check the org_members insert in runSeed.',
    ).toBe(5);
  });

  it('has exactly one user that belongs to both organizations', async () => {
    const rows = await sql<{ user_id: string; org_count: number }[]>`
      select user_id, count(distinct organization_id)::int as org_count
      from org_members
      group by user_id
      having count(distinct organization_id) > 1
    `;

    // The overlapping-membership invariant the lesson exists to install: one
    // user (Ada) is a member of both orgs, so multi-tenant reads must always be
    // scoped by organization, not by user.
    expect(
      rows.length,
      'Exactly one user must belong to both organizations (the overlapping-membership invariant — Ada in both orgs). The org_members rows do not put a single user in both orgs; check the hand-written orgMembers list in runSeed.',
    ).toBe(1);
    expect(
      rows[0]?.org_count,
      'The overlapping member must be in exactly the two seeded organizations.',
    ).toBe(2);
  });
});

// Requirement 3 — 40 customers, split across the two organizations.
describe('seeds forty customers split across both orgs (req 3)', () => {
  it('inserts exactly forty customers', () => {
    expect(
      firstCounts.customers,
      'After seeding there must be exactly 40 customers. Got a different count — check the customer loop (CUSTOMER_COUNT) in runSeed.',
    ).toBe(40);
  });

  it('places customers in both organizations, none orphaned', async () => {
    const rows = await sql<{ organization_id: string; n: number }[]>`
      select organization_id, count(*)::int as n
      from customers
      group by organization_id
      order by n desc
    `;

    expect(
      rows.length,
      'Customers must be spread across both organizations, not all parked in one. Alternate the org by index in the customer loop.',
    ).toBe(2);
    for (const row of rows) {
      expect(
        row.n,
        'Every organization should own a share of the 40 customers; one org came up empty.',
      ).toBeGreaterThan(0);
    }
  });
});

// Requirement 4 — 100+ invoices, every one belonging to a seeded org.
describe('seeds at least one hundred invoices, all tenant-owned (req 4)', () => {
  it('inserts one hundred or more invoices', () => {
    // 40 customers × 12–18 invoices each clears 100 comfortably.
    expect(
      firstCounts.invoices,
      'After seeding there must be at least 100 invoices (40 customers × 12–18 each clears it). Got fewer — check the per-customer invoice count in runSeed.',
    ).toBeGreaterThanOrEqual(100);
  });

  it('attaches every invoice to one of the two seeded organizations', async () => {
    const [row] = await sql<{ total: number; orphans: number }[]>`
      select
        count(*)::int as total,
        count(*) filter (
          where not exists (
            select 1 from organizations o where o.id = i.organization_id
          )
        )::int as orphans
      from invoices i
    `;

    // Guard against a vacuous pass on an unseeded database: there must be
    // invoices to vouch for before "none are orphaned" means anything.
    expect(
      row?.total,
      'There are no invoices to check tenant ownership against — the invoice insert in runSeed has not run.',
    ).toBeGreaterThan(0);
    expect(
      row?.orphans,
      'Every invoice must belong to one of the two seeded organizations. Some invoices point at no organization — their organizationId is not taken from the inserted orgs.',
    ).toBe(0);
  });
});

// Requirement 5 — running the seed twice leaves every table's row count unchanged.
describe('is idempotent: a second run leaves every row count unchanged (req 5)', () => {
  it('matches all six table counts across two runs', () => {
    // Guard against a vacuous pass: 0 === 0 across an unseeded database is not
    // idempotency. There must be real rows to preserve before equality means
    // anything.
    expect(
      firstCounts.invoices,
      'The seed produced no invoices, so idempotency cannot be demonstrated. Implement the inserts in runSeed first.',
    ).toBeGreaterThan(0);
    // reset(db, schema) before inserting is what makes re-runs idempotent: the
    // database after run two looks exactly like after run one.
    expect(
      secondCounts,
      'Running the seed a second time changed the row counts. The seed must call reset(dbUnpooled, schema) before inserting so a re-run clears the prior rows instead of stacking new ones on top.',
    ).toEqual(firstCounts);
  });
});

// Requirement 6 — running the seed twice with the same SEED reproduces a
// sampled invoice. Note: the primary key comes from the column's uuidv7()
// default, so it is freshly generated on each insert and is NOT byte-identical
// across two independent seed runs (that is by design, not a determinism bug).
// What the fixed seed *does* guarantee — and what we assert — is that the data
// the PRNG drives is reproduced: the sampled invoice's number is identical run
// to run, and exactly one invoice carries it.
describe('is deterministic: same SEED reproduces a sampled invoice’s data (req 6)', () => {
  it('reproduces the sampled invoice number across two same-SEED runs', () => {
    // Guard against a vacuous pass: undefined === undefined on an unseeded
    // database is not determinism.
    expect(
      firstInvoice?.number,
      'The first seed produced no invoice to sample, so determinism cannot be demonstrated. Implement the invoice inserts in runSeed first.',
    ).toBeTruthy();
    expect(
      secondInvoice?.number,
      'With the same SEED, the seeded data must be reproduced run to run. The sampled invoice number changed between runs — make sure all randomness flows through the single fixed-seed PRNG (createPrng(env.SEED)) and nothing reaches for Math.random or Date.now.',
    ).toBe(firstInvoice?.number);
  });

  it('reproduces exactly one invoice carrying the sampled number', async () => {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n
      from invoices
      where number = ${secondInvoice?.number ?? '__none__'}
    `;
    expect(
      row?.n,
      'The sampled invoice number must identify exactly one invoice after the re-run. A missing or duplicated number means the per-invoice number sequence is not deterministic, or reset() did not clear the prior run.',
    ).toBe(1);
  });
});

// Requirement 7 — every invoice's lines are numbered 1..n by position with no
// gaps, and each invoice has between 2 and 4 lines.
describe('numbers invoice lines 1..n per invoice with two to four lines each (req 7)', () => {
  it('gives every invoice between two and four line items', async () => {
    const rows = await sql<{ line_count: number }[]>`
      select count(*)::int as line_count
      from invoice_lines
      group by invoice_id
    `;

    const counts = rows.map((r) => r.line_count);
    expect(
      counts.length,
      'No invoice has any line items. Each invoice must carry 2–4 lines; check the line-item flatMap in runSeed.',
    ).toBeGreaterThan(0);

    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(
      min,
      `Every invoice must have at least 2 line items; one had ${min}. Check prng.int(2, 4) in the line-item loop.`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      max,
      `Every invoice must have at most 4 line items; one had ${max}. Check prng.int(2, 4) in the line-item loop.`,
    ).toBeLessThanOrEqual(4);
  });

  it('numbers each invoice’s lines 1..n by position with no gaps', async () => {
    const [{ total } = { total: 0 }] = await sql<{ total: number }[]>`
      select count(*)::int as total from invoice_lines
    `;
    // Guard against a vacuous pass: "no broken runs" is trivially true when
    // there are no lines at all.
    expect(
      total,
      'There are no invoice lines to check position numbering against — the line-item insert in runSeed has not run.',
    ).toBeGreaterThan(0);

    // A clean 1..n run means: positions are distinct, start at 1, and the max
    // equals the count — no holes, no duplicates, no zero/negative positions.
    const [bad] = await sql<{ broken: number }[]>`
      select count(*)::int as broken
      from (
        select invoice_id
        from invoice_lines
        group by invoice_id
        having
          min(position) <> 1
          or max(position) <> count(*)
          or count(distinct position) <> count(*)
      ) gaps
    `;

    expect(
      bad?.broken,
      'Every invoice’s lines must be numbered 1..n by position with no gaps or duplicates (the invoice_lines_invoice_position_unique constraint depends on it). Some invoices have a broken position run — number lines starting at 1 inside each invoice’s flatMap.',
    ).toBe(0);
  });
});
