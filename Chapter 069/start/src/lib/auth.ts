import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache, createElement } from 'react';

import { db } from '@/db';
import * as authSchema from '@/db/schema/auth';
import WelcomeVerification from '@/emails/welcome-verification';
import { env } from '@/env';
import type { Role } from '@/lib/auth/roles';
import { sendEmail } from '@/lib/email';

// Declared once here, imported by the proxy. `__Host-` can't set over
// http://localhost, so dev drops the prefix.
export const SESSION_COOKIE_PREFIX =
  process.env.NODE_ENV === 'production' ? '__Host-better-auth' : 'better-auth';

// Invitation lifetime, referenced by the send/accept flows. Declared at module
// scope so S1 can pass it to the organization plugin's `invitationExpiresIn`.
export const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7;

// The session-create hook seeds activeOrganizationId from the user's most-recent
// membership. One org per user in this project, so findFirst is enough.
const pickInitialActiveOrg = async (userId: string): Promise<string | null> => {
  const membership = await db.query.member.findFirst({
    where: eq(authSchema.member.userId, userId),
  });
  return membership?.organizationId ?? null;
};

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    autoSignIn: false,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your email',
        react: createElement(WelcomeVerification, {
          firstName: user.name,
          verifyUrl: url,
        }),
        idempotencyKey: `verify:${user.id}:${url}`,
      });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 10,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    cookiePrefix: SESSION_COOKIE_PREFIX,
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  // Seed activeOrganizationId on every session mint — the one place all sign-in /
  // sign-up / verification paths flow through, so the setter is never sprinkled
  // across the individual flows.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await pickInitialActiveOrg(session.userId),
          },
        }),
      },
    },
  },
  // organization() before nextCookies(): nextCookies() MUST be last in `plugins` —
  // it flushes Set-Cookie from the action response; out of order, sign-up/sign-in
  // succeed server-side but no cookie lands. The invitation additionalFields are
  // server-managed (input: false): the app sets tokenHash/acceptedAt, never the API
  // caller.
  plugins: [
    organization({
      teams: { enabled: false },
      invitationExpiresIn: INVITATION_TTL_SECONDS,
      schema: {
        invitation: {
          additionalFields: {
            tokenHash: { type: 'string', required: true, input: false },
            acceptedAt: { type: 'date', required: false, input: false },
          },
        },
      },
    }),
    nextCookies(),
  ],
});

type User = typeof auth.$Infer.Session.user;

// The single direct session read in the codebase; `cache` dedupes it per request.
// Every read flows through getCurrentUser / requireUser, never this directly.
const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export const getCurrentUser = async (): Promise<User | null> =>
  (await getSession())?.user ?? null;

export const requireUser = async (next?: string): Promise<User> => {
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      (next
        ? `/sign-in?next=${encodeURIComponent(next)}`
        : '/sign-in') as Route,
    );
  }
  return user;
};

// Resolves the active-org context for a protected request. The orgId comes only
// from the server-validated session (never a query/route param); the role is read
// fresh from the membership row via getActiveMember (a DB read), since the cookie
// cache can carry a stale role for the freshAge window. `cache` dedupes per request.
export const requireOrgUser = cache(
  async (): Promise<{ user: User; orgId: string; role: Role }> => {
    const session = await getSession();
    if (!session) {
      redirect('/sign-in' as Route);
    }

    const orgId = session.session.activeOrganizationId;
    if (!orgId) {
      redirect('/onboarding/create-org' as Route);
    }

    const activeMember = await auth.api.getActiveMember({
      headers: await headers(),
    });
    if (!activeMember) {
      redirect('/onboarding/create-org' as Route);
    }

    return { user: session.user, orgId, role: activeMember.role as Role };
  },
);
