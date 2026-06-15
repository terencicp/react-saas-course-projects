import 'server-only';

import { cache } from 'react';
import type { Locale } from '@/lib/i18n/supported';
import { getSession } from '@/server/session';

// Thin, request-cached resolvers over the session's profile fields. The
// formatter seam reads the viewer's timeZone from here so every date renders in
// the right wall-clock; the locale resolver mirrors `getRequestConfig`'s pick.
export const getCurrentUserTimeZone = cache(async (): Promise<string> => {
  const session = await getSession();
  return session.timeZone ?? 'UTC';
});

export const getCurrentUserLocale = cache(async (): Promise<Locale> => {
  const session = await getSession();
  return session.locale ?? 'en-US';
});
