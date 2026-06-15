import { pathToFileURL } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { reset } from 'drizzle-seed';
import { uuidv7 } from 'uuidv7';

import { auditLogs } from '@/db/audit';
import { dbUnpooled } from '@/db/index';
import { invoices } from '@/db/schema';
import { account, member, organization, session, user } from '@/db/schema/auth';

// The deterministic multi-tenant seed. Runs under tsx (CLI) and via the inspector's
// resetAndReseedAction. It imports better-auth/crypto's hashPassword (a server-only-
// free util) — never @/lib/auth, whose server-only import throws outside Next — so
// the seeded credential accounts are sign-in-able with the same scrypt format the
// app verifies.
//
// All org/user/member ids are fixed; invoice ids are uuidv7 (time-ordered, fixed
// per-run by index offset so the list paging is deterministic). The org/member rows
// supply every column the plugin owns with no DB default (organization.createdAt,
// member.id, member.createdAt have no defaultNow()/PK default), so each direct
// insert sets them explicitly.
//
// drizzle-seed cannot seed the constraint-heavy member/invoices tables, so the seed
// truncates with reset() then runs direct inserts.

const SEED_PASSWORD = 'inspector-password-12';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const USERS = [
  { id: 'user_alice', name: 'Alice', email: 'alice@acme.test' },
  { id: 'user_bob', name: 'Bob', email: 'bob@acme.test' },
  { id: 'user_carol', name: 'Carol', email: 'carol@acme.test' },
  { id: 'user_dave', name: 'Dave', email: 'dave@globex.test' },
  { id: 'user_erin', name: 'Erin', email: 'erin@globex.test' },
] as const;

const ORGS = [
  { id: 'org_acme', name: 'Acme', slug: 'acme' },
  { id: 'org_globex', name: 'Globex', slug: 'globex' },
] as const;

const MEMBERS = [
  {
    id: 'member_alice_acme',
    userId: 'user_alice',
    organizationId: 'org_acme',
    role: 'admin',
  },
  {
    id: 'member_bob_acme',
    userId: 'user_bob',
    organizationId: 'org_acme',
    role: 'member',
  },
  {
    id: 'member_carol_acme',
    userId: 'user_carol',
    organizationId: 'org_acme',
    role: 'member',
  },
  {
    id: 'member_dave_globex',
    userId: 'user_dave',
    organizationId: 'org_globex',
    role: 'admin',
  },
  {
    id: 'member_erin_globex',
    userId: 'user_erin',
    organizationId: 'org_globex',
    role: 'member',
  },
] as const;

const STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const;

// ~30 invoices per org across statuses, plus one pre-archived + one pre-soft-
// deleted row per org so the lifecycle views are non-empty. The contract dropped
// `total`, so the finished schema's seed sets only the subtotal/tax pair (both
// NOT NULL after the promotion); the combined amount is derived at the app layer.
const orgInvoices = (orgId: string, prefix: string) => {
  const rows: (typeof invoices.$inferInsert)[] = [];
  for (let i = 0; i < 30; i++) {
    const subtotal = (100 + i * 10).toFixed(2);
    const tax = (Math.round(Number(subtotal) * 0.1 * 100) / 100).toFixed(2);
    rows.push({
      id: uuidv7(),
      organizationId: orgId,
      number: `${prefix}-${String(i + 1).padStart(4, '0')}`,
      customerName: `Customer ${prefix} ${i + 1}`,
      status: STATUSES[i % STATUSES.length],
      subtotal,
      tax,
      currency: 'USD',
      createdAt: new Date(NOW.getTime() + i * 60_000),
      archivedAt: i === 5 ? NOW : null,
      deletedAt: i === 7 ? NOW : null,
      version: 1,
    });
  }
  return rows;
};

export const runSeed = async (): Promise<void> => {
  await reset(dbUnpooled, {
    invoices,
    user,
    session,
    account,
    organization,
    member,
    auditLogs,
  });

  const passwordHash = await hashPassword(SEED_PASSWORD);

  await dbUnpooled.insert(user).values(
    USERS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );

  await dbUnpooled.insert(account).values(
    USERS.map((u) => ({
      id: `account_${u.id}`,
      accountId: u.id,
      providerId: 'credential',
      userId: u.id,
      password: passwordHash,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );

  await dbUnpooled.insert(organization).values(
    ORGS.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: NOW,
    })),
  );

  await dbUnpooled.insert(member).values(
    MEMBERS.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      userId: m.userId,
      role: m.role,
      createdAt: NOW,
    })),
  );

  await dbUnpooled
    .insert(invoices)
    .values([
      ...orgInvoices('org_acme', 'ACME'),
      ...orgInvoices('org_globex', 'GLBX'),
    ]);

  // A baseline audit row per org so the inspector's audit tail is non-empty at
  // first paint. Fixture inserts (bypassing logAudit): the seed runs as the
  // superuser postgres (BYPASSRLS), which clears the FORCE-RLS policy.
  await dbUnpooled.insert(auditLogs).values([
    {
      organizationId: 'org_acme',
      actorUserId: 'user_alice',
      action: 'invoice.seed',
      subjectType: 'invoice',
      subjectId: 'seed',
      createdAt: NOW,
    },
    {
      organizationId: 'org_globex',
      actorUserId: 'user_dave',
      action: 'invoice.seed',
      subjectType: 'invoice',
      subjectId: 'seed',
      createdAt: NOW,
    },
  ]);

  console.info('[seed] seeded 2 orgs, 5 users, ~60 invoices, 2 audit rows');
};

// Run as a CLI: pathToFileURL normalizes the entry path so the guard fires even
// when the project path contains a space (import.meta.url percent-encodes it
// while process.argv[1] keeps it literal — a naive compare would silently skip).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runSeed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
