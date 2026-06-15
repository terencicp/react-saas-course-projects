'use client';

// Provided (L2 reference) — the typed store-access hook; read it, don't edit it.

import { useContext } from 'react';
import { useStore } from 'zustand';
import { WizardStoreContext } from '@/app/(app)/customers/new/_components/wizard-store-provider';
import type { WizardStore } from '@/app/(app)/customers/new/_lib/wizard/wizard-types';

// The only store access. Reads the store handle from Context, throws if mounted
// outside the provider, and binds with `useStore(store, selector)`. The selector
// is typed on the full `WizardStore` so the submit button can select `reset`
// (which lives on `WizardStore`, not `WizardState`); `WizardState`-typed
// selectors still pass by contravariance.
export function useWizardStore<T>(selector: (s: WizardStore) => T): T {
  const store = useContext(WizardStoreContext);
  if (store === null) {
    throw new Error('useWizardStore must be used within a WizardStoreProvider');
  }
  return useStore(store, selector);
}
