import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Lesson 3 — Authoring the schema and shipping the init migration.
//
// This suite asserts the *observable Postgres state* the init migration must
// produce — never file paths, export names, or imports. It introspects the live
// database through information_schema / pg_catalog, the same way an auditor would
// confirm what actually shipped. It connects to the local Docker Postgres the
// project's db:* scripts target.
//
// Before running it, apply the migration the lesson asks you to author:
//
//   pnpm db:generate --name init_schema   # writes drizzle/0000_init_schema.sql
//   pnpm db:migrate                        # applies it to the empty database
//
// The migrate/seed scripts load .env via dotenv-cli, but Vitest does not, so we
// read the URL from the environment and fall back to the documented local
// default from .env.example. DATABASE_URL_UNPOOLED is the URL Drizzle Kit uses
// to apply DDL, so it is the one whose state we verify.
const DATABASE_URL =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/app';

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

beforeAll(async () => {
  // Fail loudly and early if the database is simply unreachable, so a connection
  // problem never masquerades as a missing-feature failure below.
  try {
    await sql`select 1`;
  } catch (cause) {
    throw new Error(
      `Could not reach Postgres at ${DATABASE_URL}. Start the database with ` +
        "`docker compose up -d` before running this lesson's tests.",
      { cause },
    );
  }
});

afterAll(async () => {
  await sql.end();
});

// confdeltype encodes the FK's ON DELETE action: 'c' = cascade, 'r' = restrict.
const onDelete = (
  rows: { conname: string; confdeltype: string }[],
  conname: string,
) => rows.find((r) => r.conname === conname)?.confdeltype;

// Pull just the column list out of a CREATE INDEX statement and normalise it:
// "... USING btree (organization_id, created_at DESC NULLS LAST)" → the inner
// text lowercased with whitespace and quotes stripped. This compares the columns
// and their ordering (the load-bearing detail) without coupling to the schema/
// table prefix Postgres echoes back.
const indexColumns = (indexdef: string | undefined) => {
  const inner = indexdef?.match(/\(([^)]*)\)\s*$/)?.[1];
  return inner?.replace(/["\s]/g, '').toLowerCase();
};

describe('Requirement 1 — clean migrate leaves exactly one migration row', () => {
  it('records exactly one applied migration in __drizzle_migrations', async () => {
    const exists = await sql<{ present: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
      ) as present
    `;

    expect(
      exists[0]?.present,
      'The drizzle.__drizzle_migrations ledger is missing. Run `pnpm db:generate --name init_schema` then `pnpm db:migrate` so the migration is applied and recorded.',
    ).toBe(true);

    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from drizzle.__drizzle_migrations
    `;

    // One migration file applied once → one ledger row. More than one means the
    // database accumulated extra migrations (e.g. migrated, re-generated, then
    // migrated again); drop and re-create the database, then migrate once from a
    // clean slate as the lesson's checklist describes.
    expect(
      rows[0]?.n,
      'Expected exactly one row in drizzle.__drizzle_migrations after a single clean migrate. Drop and re-create the database, then run `pnpm db:migrate` once.',
    ).toBe(1);
  });
});

describe('Requirement 2 — six tables with their FKs, uniques, check, and indexes', () => {
  it('creates exactly the six tables in the public schema', async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;
    const tables = rows.map((r) => r.table_name);

    for (const name of [
      'organizations',
      'users',
      'org_members',
      'customers',
      'invoices',
      'invoice_lines',
    ]) {
      expect(
        tables,
        `Table "${name}" is missing after migrate. The schema must declare all six tables; check db/schema.ts, then re-run db:generate + db:migrate.`,
      ).toContain(name);
    }
  });

  it('points every foreign key at the right ON DELETE action', async () => {
    const fks = await sql<{ conname: string; confdeltype: string }[]>`
      select conname, confdeltype
      from pg_constraint
      where contype = 'f' and connamespace = 'public'::regnamespace
    `;

    // Owned children cascade with their parent; referenced entities restrict so a
    // row the schema can't make sense of without (a customer, an author) cannot
    // disappear out from under it.
    const cascade: Record<string, string> = {
      org_members_organization_id_organizations_id_fk:
        'org_members → organizations',
      org_members_user_id_users_id_fk: 'org_members → users',
      customers_organization_id_organizations_id_fk:
        'customers → organizations',
      invoices_organization_id_organizations_id_fk: 'invoices → organizations',
      invoice_lines_invoice_id_invoices_id_fk: 'invoice_lines → invoices',
    };
    const restrict: Record<string, string> = {
      invoices_customer_id_customers_id_fk: 'invoices → customers',
      invoices_created_by_users_id_fk: 'invoices → users (author)',
    };

    for (const [conname, edge] of Object.entries(cascade)) {
      expect(
        onDelete(fks, conname),
        `The ${edge} foreign key should be ON DELETE CASCADE (an owned child). Set onDelete: 'cascade' on this .references() in db/schema.ts.`,
      ).toBe('c');
    }
    for (const [conname, edge] of Object.entries(restrict)) {
      expect(
        onDelete(fks, conname),
        `The ${edge} foreign key should be ON DELETE RESTRICT (a referenced entity). Set onDelete: 'restrict' on this .references() in db/schema.ts.`,
      ).toBe('r');
    }
  });

  it('scopes the uniqueness constraints to the tenant where the domain demands', async () => {
    const uniques = await sql<{ conname: string; def: string }[]>`
      select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
      where contype = 'u' and connamespace = 'public'::regnamespace
    `;
    const norm = (conname: string) =>
      uniques
        .find((u) => u.conname === conname)
        ?.def.replace(/["\s]/g, '')
        .toLowerCase();

    expect(
      norm('organizations_slug_unique'),
      'organizations.slug must be globally unique — add .unique() (organizations_slug_unique) on slug.',
    ).toBe('unique(slug)');

    expect(
      norm('users_email_unique'),
      'users.email must be globally unique — add .unique() (users_email_unique) on email.',
    ).toBe('unique(email)');

    expect(
      norm('customers_org_email_unique'),
      'A customer email is unique per tenant, not globally: customers_org_email_unique must cover (organization_id, email).',
    ).toBe('unique(organization_id,email)');

    expect(
      norm('invoices_org_number_unique'),
      'An invoice number is unique per tenant, not globally: invoices_org_number_unique must cover (organization_id, number).',
    ).toBe('unique(organization_id,number)');

    expect(
      norm('invoice_lines_invoice_position_unique'),
      'A line position is unique within its invoice: invoice_lines_invoice_position_unique must cover (invoice_id, position).',
    ).toBe('unique(invoice_id,position)');
  });

  it('enforces the non-negative invoice total with a check constraint', async () => {
    const checks = await sql<{ conname: string; def: string }[]>`
      select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
      where contype = 'c' and connamespace = 'public'::regnamespace
        and conname = 'invoices_total_nonneg'
    `;

    expect(
      checks.length,
      "The invoices_total_nonneg check constraint is missing. Add check('invoices_total_nonneg', sql`...total >= 0`) so the database itself refuses a negative total.",
    ).toBe(1);

    // pg renders it as CHECK ((total >= (0)::numeric)); assert the >= 0 guard
    // regardless of the numeric cast noise.
    expect(
      checks[0]?.def.replace(/\s/g, '').toLowerCase(),
      'The invoices_total_nonneg constraint must guard total >= 0.',
    ).toMatch(/total>=\(?0/);
  });

  it('creates the three query-justified indexes with the right columns and DESC ordering', async () => {
    const indexes = await sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'invoices'
    `;
    const columnsOf = (name: string) =>
      indexColumns(indexes.find((i) => i.indexname === name)?.indexdef);

    // The composite indexes must match the list query's where + orderBy direction:
    // tenant first, then the cursor keyset (created_at, id) descending. Column
    // order and DESC are the whole point — the planner only uses the index for the
    // keyset scan when both line up.
    expect(
      columnsOf('idx_invoices_org_status_created_at_id'),
      'idx_invoices_org_status_created_at_id must index (organization_id, status, created_at DESC, id DESC) — the keyset for the status-filtered list query.',
    ).toBe('organization_id,status,created_atdescnullslast,iddescnullslast');

    expect(
      columnsOf('idx_invoices_org_created_at_id'),
      'idx_invoices_org_created_at_id must index (organization_id, created_at DESC, id DESC) — the keyset for the unfiltered list query.',
    ).toBe('organization_id,created_atdescnullslast,iddescnullslast');

    expect(
      columnsOf('idx_invoices_customer_id'),
      'idx_invoices_customer_id must index (customer_id) — the detail join column.',
    ).toBe('customer_id');
  });
});
