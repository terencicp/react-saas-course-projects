import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
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
// scope so L2 can pass it to the organization plugin's `invitationExpiresIn`.
export const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7;

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
  // TODO(L2) — add organization() plugin (teams off, invitationExpiresIn,
  // invitation additionalFields tokenHash/acceptedAt) BEFORE nextCookies(), and
  // databaseHooks.session.create.before to seed activeOrganizationId.
  // nextCookies() MUST be last in `plugins` — it flushes Set-Cookie from the action
  // response; out of order, sign-up/sign-in succeed server-side but no cookie lands.
  plugins: [nextCookies()],
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

// TODO(L2) — resolve { user, orgId, role } from the validated session; role from
// getActiveMember (DB, not cookie); redirect to /onboarding/create-org when no
// active org / no membership.
//
// Placeholder until L2: returns the real signed-in user with an empty org so the
// inspector's panels render their empty states (rather than redirect-looping) before
// the organization plugin exists. The student replaces this body in L2.
export const requireOrgUser = async (): Promise<{
  user: User;
  orgId: string;
  role: Role;
}> => {
  const user = await requireUser();
  return { user, orgId: '', role: 'member' };
};
