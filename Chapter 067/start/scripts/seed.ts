import { pathToFileURL } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { reset } from 'drizzle-seed';

import { auditLogs } from '@/db/audit';
import { dbUnpooled } from '@/db/index';
import { emailSuppressions, exports, invoices } from '@/db/schema';
import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
} from '@/db/schema/auth';
import { env } from '@/env';

// The deterministic multi-tenant seed. Runs under tsx (CLI) and via the inspector's
// resetAndReseedAction. It imports better-auth/crypto's hashPassword (a server-only-
// free util) — never @/lib/auth, whose server-only import throws outside Next — so
// the seeded credential accounts are sign-in-able with the same scrypt format the
// app verifies.
//
// All ids are fixed so the screenshotter can target rows by id. The org/member rows
// supply every column the plugin owns with no DB default: organization.createdAt,
// member.id, and member.createdAt have no defaultNow()/PK default in the generated
// schema, so each direct insert sets them explicitly.
//
// drizzle-seed cannot seed the constraint-heavy member table, so the seed truncates
// with reset() then runs direct inserts.

const SEED_PASSWORD = 'inspector-password-12';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const USERS = [
  { id: 'user_alice', name: 'Alice', email: 'alice@acme.test' },
  { id: 'user_bob', name: 'Bob', email: 'bob@acme.test' },
  { id: 'user_carol', name: 'Carol', email: 'carol@acme.test' },
  { id: 'user_dave', name: 'Dave', email: 'dave@globex.test' },
  { id: 'user_erin', name: 'Erin', email: 'erin@initech.test' },
  { id: 'user_frank', name: 'Frank', email: 'frank@empty.test' },
] as const;

// Four orgs: three carry 200+ invoices (the paginated-export targets) and one is
// empty (the EMPTY_RESULTSET / AbortTaskRunError target the lessons trigger against).
// org_acme is the inspector's default active org.
const ORGS = [
  { id: 'org_acme', name: 'Acme', slug: 'acme' },
  { id: 'org_globex', name: 'Globex', slug: 'globex' },
  { id: 'org_initech', name: 'Initech', slug: 'initech' },
  { id: 'org_empty', name: 'Empty Co', slug: 'empty-co' },
] as const;

// The orgs that get seeded invoices, and how many each — 200+ rows so the export
// pages (pageSize 500 → one page here, but the count/loop machinery runs).
const INVOICE_ORGS = [
  // `idBase` is a 4-hex-digit org tag that prefixes each invoice's UUID last group,
  // keeping every seeded invoice id a VALID RFC-4122 uuid (the column type rejects a
  // non-hex id like "acme…"). `prefix` is the human invoice-number tag.
  { orgId: 'org_acme', prefix: 'ACME', idBase: 'ace0', count: 240 },
  { orgId: 'org_globex', prefix: 'GLBX', idBase: 'b10b', count: 210 },
  { orgId: 'org_initech', prefix: 'INIT', idBase: '1117', count: 200 },
] as const;

const MEMBERS = [
  {
    id: 'member_alice_acme',
    userId: 'user_alice',
    organizationId: 'org_acme',
    role: 'owner',
  },
  {
    id: 'member_bob_acme',
    userId: 'user_bob',
    organizationId: 'org_acme',
    role: 'admin',
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
    role: 'owner',
  },
  {
    id: 'member_erin_initech',
    userId: 'user_erin',
    organizationId: 'org_initech',
    role: 'owner',
  },
  {
    id: 'member_frank_empty',
    userId: 'user_frank',
    organizationId: 'org_empty',
    role: 'owner',
  },
] as const;

// Deterministic invoice fixtures. Fixed ids (uuidv7-shaped is unnecessary — the seed
// supplies the PK so the row is stable across boots) and createdAt descending so the
// cursor pagination order is reproducible. No randomness that drifts across boots.
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const;
const INVOICE_CUSTOMERS = [
  'Northwind Traders',
  'Globex Holdings',
  'Initech Labs',
  'Umbrella Retail',
  'Stark Industries',
  'Wayne Foods',
  'Hooli Cloud',
  'Pied Piper',
  'Soylent Co',
  'Cyberdyne Systems',
] as const;

const INVOICE_ANCHOR = Date.parse('2026-05-01T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

type InvoiceSeed = typeof invoices.$inferInsert;

const buildInvoices = (
  orgId: string,
  prefix: string,
  idBase: string,
  count: number,
): InvoiceSeed[] => {
  const rows: InvoiceSeed[] = [];
  for (let i = 1; i <= count; i++) {
    // Spacing by the hour keeps every createdAt distinct (a clean cursor key) while
    // staying inside one month. id is a fixed, RFC-valid uuid per (org, index): the
    // last group is the org's idBase (4 hex) + an 8-digit zero-padded index.
    const createdAt = new Date(INVOICE_ANCHOR - (i - 1) * HOUR);
    rows.push({
      id: `00000000-0000-7000-8000-${idBase}${String(i).padStart(8, '0')}`,
      organizationId: orgId,
      number: `${prefix}-${String(1000 + i)}`,
      customerName: INVOICE_CUSTOMERS[i % INVOICE_CUSTOMERS.length] ?? 'Acme',
      status: INVOICE_STATUSES[i % INVOICE_STATUSES.length] ?? 'draft',
      total: (100 + i).toFixed(2),
      currency: 'USD',
      createdAt,
      dueAt:
        i % 3 === 0 ? new Date(createdAt.getTime() + 30 * 24 * HOUR) : null,
    });
  }
  return rows;
};

// The one seeded completed export row for the active org — so the inspector renders a
// populated run panel (progress bar full) + one export.invoices.completed audit row at
// seed, deterministically, with no live worker.
const SEED_EXPORT = {
  organizationId: 'org_acme',
  requestedBy: 'user_alice',
  runId: 'run_seed_completed',
  rowCount: 240,
  dayBucket: '2026-05-01',
  pagesDone: 1,
  pagesTotal: 1,
  downloadUrl: 'https://example.com/exports/run_seed_completed.csv',
} as const;

// The one seeded pending invitation. The raw token is a FIXED literal so the
// screenshotter (and the inspector's dev Copy-URL button) can reconstruct the
// canonical accept URL without the raw token ever living in the DB — only its
// sha256 is stored. expiresAt is a fixed far-future date so the invite stays
// pending regardless of when the seed runs. The hash + HMAC sig are computed with
// bare Web Crypto here, mirroring @/lib/invitations/url, because the seed also runs
// as a tsx CLI where that module's `server-only` import would throw.
const INVITE = {
  id: 'invitation_acme_pending',
  organizationId: 'org_acme',
  email: 'newcomer@acme.test',
  role: 'member',
  inviterId: 'user_bob',
  expiresAt: new Date('2099-12-31T00:00:00.000Z'),
} as const;
const INVITE_RAW_TOKEN = 'seed-fixed-invite-token-do-not-use-in-prod';

const sha256Hex = async (raw: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(new TextEncoder().encode(raw)),
  );
  return Buffer.from(new Uint8Array(digest)).toString('hex');
};

const inviteSig = async (
  invitationId: string,
  rawToken: string,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(env.INVITATION_SIGNING_SECRET, 'base64'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new Uint8Array(new TextEncoder().encode(`${invitationId}.${rawToken}`)),
  );
  return Buffer.from(new Uint8Array(signature)).toString('base64url');
};

// The seeded audit row makes the inspector's audit tail non-empty at first paint.
// It is a fixture insert (bypassing logAudit): the seed runs as the superuser
// postgres (BYPASSRLS), which clears the FORCE-RLS policy without a withTenant tx.
// The id uuid is the lone $defaultFn PK, so it is omitted — Drizzle fills it.
export const runSeed = async (): Promise<void> => {
  await reset(dbUnpooled, {
    emailSuppressions,
    user,
    session,
    account,
    organization,
    member,
    auditLogs,
    invoices,
    exports,
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

  // 200+ invoices per invoice-bearing org (org_empty intentionally gets none — the
  // EMPTY_RESULTSET target). Inserted in chunks so the parameter count stays sane.
  for (const { orgId, prefix, idBase, count } of INVOICE_ORGS) {
    const rows = buildInvoices(orgId, prefix, idBase, count);
    for (let i = 0; i < rows.length; i += 100) {
      await dbUnpooled.insert(invoices).values(rows.slice(i, i + 100));
    }
  }

  // One completed export row for the active org so the run panel renders full at
  // first paint. The id uuid is the lone $defaultFn PK, so it is omitted.
  await dbUnpooled.insert(exports).values({
    organizationId: SEED_EXPORT.organizationId,
    requestedBy: SEED_EXPORT.requestedBy,
    status: 'completed',
    runId: SEED_EXPORT.runId,
    rowCount: SEED_EXPORT.rowCount,
    dayBucket: SEED_EXPORT.dayBucket,
    pagesDone: SEED_EXPORT.pagesDone,
    pagesTotal: SEED_EXPORT.pagesTotal,
    downloadUrl: SEED_EXPORT.downloadUrl,
    requestedAt: NOW,
    completedAt: NOW,
  });

  // The seeded audit rows make the inspector's audit tail non-empty at first paint.
  // Fixture inserts (bypassing logAudit): the seed runs as the superuser postgres
  // (BYPASSRLS), which clears the FORCE-RLS policy without a withTenant tx. The
  // export.invoices.completed row mirrors what the real task body writes when it
  // closes a run (actorUserId: null — the task has no session).
  await dbUnpooled.insert(auditLogs).values([
    {
      organizationId: 'org_acme',
      actorUserId: 'user_bob',
      action: 'member.role-changed',
      subjectType: 'member',
      subjectId: 'member_carol_acme',
      payload: { before: 'admin', after: 'member' },
      createdAt: NOW,
    },
    {
      organizationId: SEED_EXPORT.organizationId,
      actorUserId: null,
      action: 'export.invoices.completed',
      subjectType: 'export',
      subjectId: SEED_EXPORT.runId,
      payload: { rowCount: SEED_EXPORT.rowCount },
      createdAt: NOW,
    },
  ]);

  await dbUnpooled.insert(invitation).values({
    id: INVITE.id,
    organizationId: INVITE.organizationId,
    email: INVITE.email,
    role: INVITE.role,
    status: 'pending',
    expiresAt: INVITE.expiresAt,
    createdAt: NOW,
    inviterId: INVITE.inviterId,
    tokenHash: await sha256Hex(INVITE_RAW_TOKEN),
  });

  const sig = await inviteSig(INVITE.id, INVITE_RAW_TOKEN);
  const acceptUrl = new URL('/accept-invite', env.NEXT_PUBLIC_APP_URL);
  acceptUrl.searchParams.set('id', INVITE.id);
  acceptUrl.searchParams.set('token', INVITE_RAW_TOKEN);
  acceptUrl.searchParams.set('sig', sig);
  console.info('[seed] pending invite accept URL:', acceptUrl.toString());
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
