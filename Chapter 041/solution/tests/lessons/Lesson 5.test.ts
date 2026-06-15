import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Lesson 5 — The tenant-scoped invoice list with cursor pagination.
//
// This suite drives the student's own `listInvoices` (the public surface of
// src/lib/invoices/queries.ts) and asserts on the *returned* rows and cursor —
// never file paths, export names, or imports. listInvoices is given an already
// typed `ListInvoicesInput` (the inspector page parses the URL and decodes the
// cursor at its boundary, so these tests craft typed inputs directly: an
// organizationId, an optional status, an optional decoded Cursor, a pageSize).
//
// It runs against the project's local Docker Postgres, on the schema lesson 3
// migrated in and populated by the lesson 4 seed. The seed is a *prerequisite*
// for this lesson, not under test here, so this suite reads the already-seeded
// data rather than re-running the seed (re-seeding is lesson 4's concern). Bring
// the database up, migrate it, and seed it before running:
//
//   docker compose up -d
//   pnpm db:migrate
//   pnpm db:seed
//
// The assertions read whatever the seed produced (two orgs, 100+ invoices)
// dynamically, so they stay stable across runs without assuming exact ids.
//
// listInvoices reaches the DB through `@/db` → `@/env`, and @t3-oss/env
// validates the environment at import time. Vitest does not load .env (only the
// db:* scripts do, via dotenv-cli), so we set the required variables on
// process.env *before* the dynamic imports below. Without this the import would
// throw "Invalid environment variables" and every test would error at setup
// rather than fail informatively.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  'postgres://postgres:postgres@localhost:5432/app';

process.env.DATABASE_URL = DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED =
  process.env.DATABASE_URL_UNPOOLED ?? DATABASE_URL;
// The seed is deterministic; pin SEED so the seeded distribution is the same on
// every run and the counts the assertions below lean on stay stable.
process.env.SEED = process.env.SEED ?? '1';

// A read-only auditor connection, separate from the one the query/seed use, so
// we observe the same database the student's code reads.
const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

// The decoded cursor the inspector passes in: the (createdAt, id) tiebreaker
// pair, not the opaque token. The query receives this shape, never the string.
type Cursor = { createdAt: string; id: string };

// A minimal view of a returned row — enough to assert tenant scope, status,
// the joined customer, and cursor identity without binding to the full type.
type Row = {
  id: string;
  organizationId: string;
  status: string;
  createdAt: Date;
  customer?: { name?: string } | null;
};
type Page = { rows: Row[]; nextCursor: string | null };

// The crafted input the inspector would pass after parsing the URL. pageSize is
// always supplied here so the shape matches the parsed ListInvoicesInput.
type Input = {
  organizationId: string;
  status?: string;
  cursor?: Cursor;
  pageSize: number;
};

// The student's read and the cursor codec, loaded after env is set. The holder
// is typed structurally (not by importing the student's types) so the suite
// stays self-contained; the call is cast at the boundary to bridge the two.
let listInvoices: (input: Input) => Promise<Page>;
let decodeCursor: (token: string) => Cursor | null;

// The two seeded organizations, discovered after seeding (the seed mints fresh
// uuidv7 ids each run, so we never hardcode them).
let orgA: { id: string; invoices: number };
let orgB: { id: string; invoices: number };
// A status that exists in orgA, captured so the status-filter assertions are not
// vacuous regardless of how the seed bands statuses.
let paidCount: number;

const orgRows = async () =>
  sql<{ id: string; n: number }[]>`
    select o.id, count(i.id)::int as n
    from organizations o
    left join invoices i on i.organization_id = o.id
    group by o.id
    order by n desc
  `;

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
  // The student's listInvoices is typed against the parsed ListInvoicesInput and
  // the inferred row type; bridge to this suite's structural types at the import
  // boundary so the assertions can read rows/nextCursor without importing them.
  listInvoices = queries.listInvoices as unknown as typeof listInvoices;
  ({ decodeCursor } = await import('@/db/cursor'));

  const orgs = await orgRows();
  if (orgs.length < 2 || !orgs[0] || !orgs[1] || orgs[1].n === 0) {
    throw new Error(
      'Expected two seeded organizations, each with invoices, before this ' +
        "lesson's tests can run. The database is not seeded — run `pnpm db:seed` " +
        '(after `pnpm db:migrate`) to populate it, then re-run the tests.',
    );
  }
  orgA = { id: orgs[0].id, invoices: orgs[0].n };
  orgB = { id: orgs[1].id, invoices: orgs[1].n };

  const [paid] = await sql<{ n: number }[]>`
    select count(*)::int as n
    from invoices
    where organization_id = ${orgA.id} and status = 'paid'
  `;
  paidCount = paid?.n ?? 0;
}, 120_000);

afterAll(async () => {
  await sql.end();
});

// Requirement 1 — the list is scoped to one organization; switching orgs
// changes which rows appear.
describe('scopes the list to one organization (req 1)', () => {
  it('returns only rows belonging to the requested organization', async () => {
    const { rows } = await listInvoices({
      organizationId: orgA.id,
      pageSize: 100,
    });

    expect(
      rows.length,
      'listInvoices returned no rows for a seeded organization. The tenant-scoped findMany has not been implemented — it still returns the empty stub.',
    ).toBeGreaterThan(0);
    expect(
      rows.every((r) => r.organizationId === orgA.id),
      'Every returned row must belong to the requested organizationId. A row from another org came back — the organizationId guard is missing from the query `where`.',
    ).toBe(true);
  });

  it('returns a different set of rows for a different organization', async () => {
    const a = await listInvoices({ organizationId: orgA.id, pageSize: 100 });
    const b = await listInvoices({ organizationId: orgB.id, pageSize: 100 });

    const aIds = new Set(a.rows.map((r) => r.id));
    const overlap = b.rows.filter((r) => aIds.has(r.id));

    expect(
      b.rows.length,
      'The second organization returned no rows. Switching organizationId must change which invoices are listed; the query is not scoping by the passed organizationId.',
    ).toBeGreaterThan(0);
    expect(
      overlap.length,
      'Two different organizations returned overlapping invoice rows. The list must be partitioned by organizationId — the same invoice appeared under both orgs.',
    ).toBe(0);
  });
});

// Requirement 2 — no cross-org leak: invoices for one org never appear under
// another (the IDOR failure mode the tenant guard prevents).
describe('never leaks another org’s rows (req 2)', () => {
  it('confirms via the database that no returned row belongs elsewhere', async () => {
    const { rows } = await listInvoices({
      organizationId: orgA.id,
      pageSize: 100,
    });

    const ids = rows.map((r) => r.id);
    expect(
      ids.length,
      'No rows came back to check for leakage. Implement listInvoices first.',
    ).toBeGreaterThan(0);

    // Ask the database directly which of the returned ids actually belong to a
    // *different* org. The guard must live in the query, so this is always 0.
    const [{ leaked } = { leaked: 0 }] = await sql<{ leaked: number }[]>`
      select count(*)::int as leaked
      from invoices
      where id = any(${ids}) and organization_id <> ${orgA.id}
    `;
    expect(
      leaked,
      'A returned row belongs to a different organization. The tenant guard must be inside the query `where` (eq(organizationId, ...)), not a check applied after loading — loading then filtering is the IDOR leak this lesson exists to prevent.',
    ).toBe(0);
  });
});

// Requirement 3 — paging forward via nextCursor yields fresh pages with no
// repeats, and nextCursor is null on the last page. The seed commits every
// invoice with the same createdAt, so correct paging depends entirely on the
// (createdAt, id) tiebreaker — a createdAt-only cursor would skip or duplicate.
describe('pages forward with no repeats and a null cursor at the end (req 3)', () => {
  it('walks every row of an org across pages with no duplicates', async () => {
    const pageSize = 50;
    const seen: string[] = [];
    let cursor: Cursor | undefined;
    let pages = 0;
    let lastCursor: string | null = null;

    while (pages < 100) {
      const page: Page = await listInvoices({
        organizationId: orgA.id,
        pageSize,
        cursor,
      });
      pages += 1;
      for (const row of page.rows) seen.push(row.id);
      lastCursor = page.nextCursor;
      if (!page.nextCursor) break;

      const next = decodeCursor(page.nextCursor);
      expect(
        next,
        'nextCursor did not decode back to a usable cursor. It must be produced with encodeCursor({ createdAt, id }) from the last kept row so the page link round-trips.',
      ).not.toBeNull();
      cursor = next ?? undefined;
    }

    const unique = new Set(seen);
    expect(
      seen.length - unique.size,
      'Paging forward repeated at least one invoice across pages. Every invoice in this org shares the same createdAt, so ordering must break ties on id — the cursor predicate needs the (createdAt, id) tiebreaker, not createdAt alone.',
    ).toBe(0);
    expect(
      unique.size,
      `Paging visited ${unique.size} distinct invoices but the org has ${orgA.invoices}. With equal timestamps a createdAt-only cursor skips or stalls; the (createdAt, id) tiebreaker must visit each row exactly once.`,
    ).toBe(orgA.invoices);
    expect(
      lastCursor,
      'The final page must report nextCursor === null. It did not — nextCursor should be null whenever the extra (pageSize + 1) row was not fetched.',
    ).toBeNull();
  });

  it('reports a non-null nextCursor while more rows remain', async () => {
    // orgA has well over 50 invoices, so the first page of 50 is not the last.
    const first = await listInvoices({ organizationId: orgA.id, pageSize: 50 });
    expect(
      first.nextCursor,
      'The first page of an org with more rows than pageSize must carry a nextCursor. It came back null — the "is there a next page?" check (rows.length > pageSize) is not driving the cursor.',
    ).not.toBeNull();
  });
});

// Requirement 4 — status: 'paid' returns only paid rows, and the result is the
// same shape whether status arrives via the URL or directly (the query takes
// the already-typed status, so passing it directly is the canonical test).
describe('filters by status server-side (req 4)', () => {
  it('returns only paid rows when status is paid', async () => {
    const { rows } = await listInvoices({
      organizationId: orgA.id,
      status: 'paid',
      pageSize: 100,
    });

    expect(
      paidCount,
      'The seed has no paid invoices for this org, so the status filter cannot be demonstrated. Check the seed.',
    ).toBeGreaterThan(0);
    expect(
      rows.length,
      'Asking for status: "paid" returned no rows even though paid invoices exist. The optional status leaf is not reaching the query `where`.',
    ).toBeGreaterThan(0);
    expect(
      rows.every((r) => r.status === 'paid'),
      'status: "paid" must return only paid rows. A non-paid row came back — add eq(t.status, status) to the query `where` when a status is passed.',
    ).toBe(true);
  });

  it('returns the same rows whether status is passed or omitted-then-narrowed', async () => {
    // The inspector parses status from the URL before calling, so the query sees
    // an identical typed value either way. Filtering in the query (not after the
    // load) means the paid subset equals the paid rows within the full list.
    const filtered = await listInvoices({
      organizationId: orgA.id,
      status: 'paid',
      pageSize: 1000,
    });
    const all = await listInvoices({ organizationId: orgA.id, pageSize: 1000 });
    const paidWithinAll = all.rows.filter((r) => r.status === 'paid');

    expect(
      paidWithinAll.length,
      'The unfiltered list returned no paid rows, so the equivalence cannot be demonstrated. Implement listInvoices first — it is returning the empty stub.',
    ).toBeGreaterThan(0);
    expect(
      new Set(filtered.rows.map((r) => r.id)),
      'The paid-filtered result must match the paid rows inside the unfiltered list — same rows, however the status reaches the query. They differ, so the status filter is changing more than the status predicate (e.g. dropping the tenant scope or the ordering).',
    ).toEqual(new Set(paidWithinAll.map((r) => r.id)));
  });
});

// Requirement 5 — a page never returns more than pageSize rows, even when more
// exist; the pageSize + 1 probe row is dropped, not emitted.
describe('never emits more than pageSize rows (req 5)', () => {
  it('caps the page at pageSize when more rows exist', async () => {
    const pageSize = 7;
    const { rows, nextCursor } = await listInvoices({
      organizationId: orgA.id,
      pageSize,
    });

    expect(
      orgA.invoices,
      'This org needs more than pageSize invoices for the cap to mean anything.',
    ).toBeGreaterThan(pageSize);
    expect(
      rows.length,
      `Requested pageSize ${pageSize} but got ${rows.length} rows. The extra (pageSize + 1) row fetched to detect a next page must be sliced off, never returned.`,
    ).toBe(pageSize);
    expect(
      nextCursor,
      'With more rows than pageSize, nextCursor must be set — the extra row signals a next page exists.',
    ).not.toBeNull();
  });

  it('returns fewer than pageSize and a null cursor when the org has fewer rows', async () => {
    const big = orgA.invoices + 50;
    const { rows, nextCursor } = await listInvoices({
      organizationId: orgA.id,
      pageSize: big,
    });

    expect(
      rows.length,
      'With pageSize larger than the org’s invoice count, every row should come back on one page.',
    ).toBe(orgA.invoices);
    expect(
      nextCursor,
      'When the whole org fits in one page, nextCursor must be null — there was no extra (pageSize + 1) row to fetch.',
    ).toBeNull();
  });
});
