import { pathToFileURL } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { reset } from 'drizzle-seed';

import { auditLogs } from '@/db/audit';
import { dbUnpooled } from '@/db/index';
import { emailSuppressions, planEntitlements } from '@/db/schema';
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
] as const;

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
    planEntitlements,
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

  // One `free` plan_entitlements row per org. The webhook is the only writer at
  // runtime, but the provisioning invariant (getEntitlement throws on a missing row)
  // means every org needs a row from the start — the seed stands in for the
  // "free row at org creation" provisioning. Direct insert (drizzle-seed cannot seed
  // the constraint-heavy table). At scaffold the table is PK-only, so only
  // organizationId is set; S3's column defaults (plan 'free', status 'active',
  // seats 1, Stripe columns null) fill the rest once the columns exist. The org's
  // stripeCustomerId stays null (no Stripe round-trip in the seed).
  await dbUnpooled.insert(planEntitlements).values(
    ORGS.map((o) => ({
      organizationId: o.id,
    })),
  );

  await dbUnpooled.insert(auditLogs).values({
    organizationId: 'org_acme',
    actorUserId: 'user_bob',
    action: 'member.role-changed',
    subjectType: 'member',
    subjectId: 'member_carol_acme',
    payload: { before: 'admin', after: 'member' },
    createdAt: NOW,
  });

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
