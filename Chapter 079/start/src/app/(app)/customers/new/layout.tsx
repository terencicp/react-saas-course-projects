import type { ReactNode } from 'react';
import { WizardStoreProvider } from '@/app/(app)/customers/new/_components/wizard-store-provider';
import { WizardFooter } from '@/app/(app)/customers/new/footer';
import { WizardProgress } from '@/app/(app)/customers/new/wizard-progress';
import { readDebugFlags } from '@/lib/debug-flags';

// The shared wizard shell. The provider mounts HERE, on the segment layout that
// persists across the four step navigations — the single per-request boundary,
// never on a step page (per-page mounting resets the draft on every
// navigation). `{children}` is one slot; the progress and footer are its
// siblings.
//
// The two inspector debug flags are read per request from the session cookie and
// passed into the provider. Both default OFF, so the rendered tree is the
// canonical correct architecture; flipping one in the inspector flips a
// canonical Zustand bug into existence (per-page mount → draft cleared on nav;
// module-scoped store → cross-session leak) so a rendered check can observe it.
const NewCustomerLayout = async ({ children }: { children: ReactNode }) => {
  const flags = await readDebugFlags();

  return (
    <WizardStoreProvider
      providerOnStepPage={flags.PROVIDER_ON_STEP_PAGE}
      storeModuleScoped={flags.STORE_MODULE_SCOPED}
    >
      <div className="mx-auto max-w-xl space-y-6">
        <WizardProgress />
        {children}
        <WizardFooter />
      </div>
    </WizardStoreProvider>
  );
};

export default NewCustomerLayout;
