'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { authedAction } from '@/lib/authed-action';
import { SUPPORTED_LOCALES } from '@/lib/i18n/supported';
import { ok, type Result } from '@/lib/result';
import { setUserLocale } from '@/server/store';

// The locale switch writes BOTH signals so the session and the URL agree: the
// store user's profile (read by `getRequestConfig`'s tz/locale seam) and the
// `NEXT_LOCALE` cookie (read by the proxy's negotiation chain). The switcher
// re-prefixes the URL after this resolves.
export const setLocaleAction = authedAction(
  'member',
  z.strictObject({ locale: z.enum(SUPPORTED_LOCALES) }),
  async (input, ctx): Promise<Result<null>> => {
    setUserLocale(ctx.userId, input.locale);
    (await cookies()).set('NEXT_LOCALE', input.locale, {
      path: '/',
      sameSite: 'lax',
    });
    return ok(null);
  },
);
