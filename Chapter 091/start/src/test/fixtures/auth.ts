import type { Transaction } from '@/db';
import { planEntitlements } from '@/db/schema';
import {
  member,
  organization,
  session as sessionTable,
  user,
} from '@/db/schema/auth';

export type Role = 'owner' | 'admin' | 'member';
export type Plan = 'free' | 'pro' | 'team';

export type SignedInOptions = {
  role?: Role;
  plan?: Plan;
  orgId?: string;
};

type SignedIn = {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; slug: string };
  session: { id: string; token: string; userId: string };
  cookieJar: Record<string, string>;
};

const id = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

// signedInAs seeds a user + org + membership + a plan_entitlements row INSIDE the given
// rollback tx and returns the created rows. It ALSO installs a session stub on
// auth.api.getSession / getActiveMember for completeness (the 088 L3 convention).
//
// IMPORTANT for THIS project: the Stripe webhook route is SESSION-LESS — it never calls
// requireOrgUser / getSession. So the three integration tests use signedInAs ONLY to
// seed the org + a `free` entitlement (and a follow-up tx.update sets stripeCustomerId)
// that the handler reads/writes. The session stub below is INERT on the webhook path —
// no lesson should imply the webhook reads a session.
export const signedInAs = async (
  opts: SignedInOptions,
  tx: Transaction,
): Promise<SignedIn> => {
  const role = opts.role ?? 'member';
  const plan = opts.plan ?? 'free';
  const now = new Date();

  const userRow = {
    id: id('user'),
    name: 'Test User',
    email: `${id('user')}@test.local`,
  };
  const orgRow = {
    id: opts.orgId ?? id('org'),
    name: 'Test Org',
    slug: id('org-slug'),
  };
  const sessionRow = {
    id: id('session'),
    token: id('token'),
    userId: userRow.id,
  };

  // Plugin-table inserts supply id/createdAt explicitly (Better Auth ids are text, the
  // columns have no DB default).
  await tx.insert(user).values({
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(organization).values({
    id: orgRow.id,
    name: orgRow.name,
    slug: orgRow.slug,
    createdAt: now,
  });
  await tx.insert(member).values({
    id: id('member'),
    organizationId: orgRow.id,
    userId: userRow.id,
    role,
    createdAt: now,
  });
  await tx.insert(sessionTable).values({
    id: sessionRow.id,
    token: sessionRow.token,
    userId: userRow.id,
    expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: orgRow.id,
  });
  await tx.insert(planEntitlements).values({ organizationId: orgRow.id, plan });

  // No session stub is installed here: the Stripe webhook route is session-less, so the
  // returned `session`/`cookieJar` exist only to satisfy the 088 fixture shape. A
  // session-reading SUT (a Server Action test, not this project) would stub
  // auth.api.getSession with these values; the webhook path never reaches it.
  return {
    user: userRow,
    org: orgRow,
    session: sessionRow,
    cookieJar: { 'better-auth.session_token': sessionRow.token },
  };
};

// The anonymous counterpart: no session. On the webhook path this is the default — the
// route reads no session — so anonymous() is a no-op marker that documents intent.
export const anonymous = (): { cookieJar: Record<string, string> } => ({
  cookieJar: {},
});
