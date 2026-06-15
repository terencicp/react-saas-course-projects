'use client';

// Provided (L2 reference) — the per-request boundary. It also carries the
// inspector's scaffold-only debug branches (STORE_MODULE_SCOPED /
// PROVIDER_ON_STEP_PAGE), so study it rather than authoring it; L2's hands-on
// work is the four slice factories and the store-wide reset.

import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useRef } from 'react';
import { useBroadcastSnapshot } from '@/app/(app)/customers/new/_components/use-broadcast-snapshot';
import {
  createWizardStore,
  type WizardStoreApi,
} from '@/app/(app)/customers/new/_lib/wizard/store';

// The per-request boundary. The Context and the ref hold the store *handle*
// (`WizardStoreApi = StoreApi<WizardStore>`), not the state object. The store is
// pinned with `useRef` (React-19/Compiler-safe, not `useState`) so a single
// instance survives back/forward across the four segments — the layout that
// mounts this persists across child navigations. A fresh `createWizardStore()`
// per request is what stops one tenant's draft leaking into another's SSR
// render. The lesson articulates that rationale; the wiring boots as shipped.
export const WizardStoreContext = createContext<WizardStoreApi | null>(null);

// SCAFFOLD-ONLY module-scoped store for the inspector's `STORE_MODULE_SCOPED`
// debug flag. The CANONICAL path never touches this — each provider mount gets
// its own `useRef`-pinned `createWizardStore()`, so two sessions never share a
// draft. When the flag is on, every mount reuses this single instance instead,
// reproducing the Ch078 L2 cross-session leak so a rendered check can observe
// it. Not part of the architecture the student authors; gated behind the flag.
let moduleScopedStore: WizardStoreApi | null = null;
const getModuleScopedStore = (): WizardStoreApi => {
  moduleScopedStore ??= createWizardStore();
  return moduleScopedStore;
};

type WizardStoreProviderProps = {
  children: ReactNode;
  // Both default OFF — the canonical correct architecture. The layout reads the
  // inspector's cookie-backed debug flags per request and passes them in; only
  // an explicit toggle flips a buggy mounting strategy into existence.
  storeModuleScoped?: boolean;
  providerOnStepPage?: boolean;
};

export const WizardStoreProvider = ({
  children,
  storeModuleScoped = false,
  providerOnStepPage = false,
}: WizardStoreProviderProps) => {
  // `providerOnStepPage` ON: re-pin the store per step page by keying the ref on
  // the pathname, so navigating step-1 → step-2 → step-1 mounts a fresh store
  // each time and clears the draft — identical to mounting the provider on each
  // step page instead of the shared layout (the canonical "draft cleared on
  // nav" bug). OFF: the pathname is ignored, the single layout-mounted store
  // survives every navigation.
  const pathname = usePathname();
  const pinKey = providerOnStepPage ? pathname : '';

  const storeRef = useRef<{ key: string; store: WizardStoreApi } | null>(null);
  if (storeRef.current === null || storeRef.current.key !== pinKey) {
    // `storeModuleScoped` ON yields the shared singleton (cross-session leak);
    // OFF yields a fresh per-mount instance (the isolated, correct store).
    storeRef.current = {
      key: pinKey,
      store: storeModuleScoped ? getModuleScopedStore() : createWizardStore(),
    };
  }

  // Mirror the store to the inspector iframe (the helper is provided).
  useBroadcastSnapshot(storeRef.current.store);

  return (
    <WizardStoreContext value={storeRef.current.store}>
      {children}
    </WizardStoreContext>
  );
};
