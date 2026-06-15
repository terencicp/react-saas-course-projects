'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

export const signOutAction = async () => {
  // Deleting the session row is the revocation — the cookie clear follows.
  await auth.api.signOut({ headers: await headers() });
  redirect('/sign-in');
};
