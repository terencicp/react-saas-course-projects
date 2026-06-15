import 'server-only';
import type { Auth } from 'better-auth';

// TODO(L2) — configure betterAuth (emailAndPassword, emailVerification, nextCookies last), export SESSION_COOKIE_PREFIX, and the cached getSession + getCurrentUser/requireUser ladder.
export const SESSION_COOKIE_PREFIX = 'better-auth';
export const getCurrentUser = async () => null;
export const requireUser = async (_next?: string) => {
  throw new Error('requireUser not implemented');
};
export const auth = {} as unknown as Auth;
