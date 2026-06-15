'use server';

import type { Result } from '@/lib/result';
import { err } from '@/lib/result';

// TODO(L2) — SignUpSchema parse, empty authorize, signUpEmail in try/catch (mapAuthError), redirect to /verify-email; no taken-email branch.
export const signUpAction = async (
  _prevState: Result<never> | null,
  _formData: FormData,
): Promise<Result<never>> => err('internal', 'Not implemented');
