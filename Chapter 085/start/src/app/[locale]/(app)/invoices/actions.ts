'use server';

import { z } from 'zod';
import { authedAction } from '@/lib/authed-action';
import { SUPPORTED_LOCALES } from '@/lib/i18n/supported';
import { err, type Result } from '@/lib/result';

// TODO(L2) — write store locale + NEXT_LOCALE cookie
//
// The locale switch should write BOTH signals so the session and the URL agree:
// the store user's profile (read by `getRequestConfig`'s tz/locale seam) and the
// `NEXT_LOCALE` cookie (read by the proxy's negotiation chain).
export const setLocaleAction = authedAction(
  'member',
  z.strictObject({ locale: z.enum(SUPPORTED_LOCALES) }),
  async (): Promise<Result<null>> => {
    return err('internal', 'Not implemented');
  },
);
