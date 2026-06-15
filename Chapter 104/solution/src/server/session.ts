import 'server-only';

import { cookies } from 'next/headers';
import { users } from '@/server/store';
import type { Role } from '@/server/types';

// A cookie-driven dev session. Stands in for `requireOrgUser` from the
// DB-backed units: there is no auth wall, so this NEVER redirects — every route
// renders. The `acting-identity` cookie names one of the seeded identities as
// `<orgId>:<role>`; absent or unknown, it defaults to `org-acme:admin`.

const COOKIE_NAME = 'acting-identity';
const DEFAULT_IDENTITY = 'org-acme:admin';

export type Session = {
  userId: string;
  orgId: string;
  role: Role;
};

const resolve = (value: string | undefined): Session => {
  const raw = value ?? DEFAULT_IDENTITY;
  const match = users.find((u) => `${u.orgId}:${u.role}` === raw);
  const user =
    match ?? users.find((u) => `${u.orgId}:${u.role}` === DEFAULT_IDENTITY);
  // The default identity always exists in the seed, so `user` is defined.
  const resolved = user ?? users[0];
  if (!resolved) {
    throw new Error('No seeded users available');
  }
  return { userId: resolved.id, orgId: resolved.orgId, role: resolved.role };
};

export const getSession = async (): Promise<Session> => {
  const store = await cookies();
  return resolve(store.get(COOKIE_NAME)?.value);
};

// Server Action: writes the identity cookie. The inspector's identity switcher
// posts this to act as a different org/role.
export const setActingIdentity = async (value: string): Promise<void> => {
  'use server';
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  });
};
