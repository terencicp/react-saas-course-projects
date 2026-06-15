'use server';

import type { Result } from '@/lib/result';
import { err } from '@/lib/result';

// TODO(L4) — SignInSchema parse, signInEmail in try/catch (mapAuthError → unauthorized/forbidden), safeNext(next), redirect.
export const signInAction = async (
  _prevState: Result<never> | null,
  _formData: FormData,
): Promise<Result<never>> => err('internal', 'Not implemented');
