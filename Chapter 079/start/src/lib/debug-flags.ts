import 'server-only';

import { cookies } from 'next/headers';

// Two debug flags the inspector toggles to flip a canonical Zustand bug into
// existence and revert it, so a rendered check can observe the failure mode:
//
// - STORE_MODULE_SCOPED — swaps the per-request factory for a single
//   module-scoped store instance (the cross-request leak from Ch078 L2).
// - PROVIDER_ON_STEP_PAGE — moves the provider off the shared layout onto each
//   step page, so the draft resets on every navigation.
//
// Cookie-driven so a server action can set them and the wizard layout/provider
// can read them per request. Off by default (the normal, correct build).

export type DebugFlag = 'STORE_MODULE_SCOPED' | 'PROVIDER_ON_STEP_PAGE';

export const DEBUG_FLAGS: DebugFlag[] = [
  'STORE_MODULE_SCOPED',
  'PROVIDER_ON_STEP_PAGE',
];

const cookieName = (flag: DebugFlag) => `debug-${flag}`;

export const readDebugFlags = async (): Promise<Record<DebugFlag, boolean>> => {
  const store = await cookies();
  return {
    STORE_MODULE_SCOPED:
      store.get(cookieName('STORE_MODULE_SCOPED'))?.value === '1',
    PROVIDER_ON_STEP_PAGE:
      store.get(cookieName('PROVIDER_ON_STEP_PAGE'))?.value === '1',
  };
};

export const setDebugFlag = async (
  flag: DebugFlag,
  on: boolean,
): Promise<void> => {
  'use server';
  const store = await cookies();
  store.set(cookieName(flag), on ? '1' : '0', {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  });
};
