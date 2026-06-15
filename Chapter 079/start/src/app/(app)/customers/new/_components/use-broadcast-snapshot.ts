'use client';

import { useEffect } from 'react';
import type { WizardStoreApi } from '@/app/(app)/customers/new/_lib/wizard/store';

// The inspector-bridge hook. The wizard pages mount inside an `<iframe>` the
// inspector opens; this hook broadcasts the store snapshot to the parent window
// via `postMessage` whenever the store changes, so the inspector's
// store-snapshot panel can mirror `currentStep`/`completedSteps`/each slice
// live. It also accepts inbound "reset" and "submit" control messages from the
// inspector (the latter triggers the step-4 submit button so the inspector's
// "Force double-submit" control can exercise the `isPending` guard).
//
// Provided in full so the student never writes `postMessage`: the provider calls
// `useBroadcastSnapshot(storeRef.current)` and the bridge is wired.

const MESSAGE_SOURCE = 'wizard-snapshot';

export const useBroadcastSnapshot = (store: WizardStoreApi): void => {
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) {
      return;
    }

    const post = () => {
      // Broadcast only the serializable data projection — `postMessage`'s
      // structured clone throws `DataCloneError` on the slice action functions
      // (`setContactField`, `goNext`, `reset`, …) the raw `getState()` carries.
      const { contact, billing, preferences, currentStep, completedSteps } =
        store.getState();
      window.parent.postMessage(
        {
          source: MESSAGE_SOURCE,
          snapshot: {
            contact,
            billing,
            preferences,
            currentStep,
            completedSteps,
          },
        },
        '*',
      );
    };

    // Broadcast the initial snapshot, then on every store change.
    post();
    const unsubscribe = store.subscribe(post);

    // The inspector's control buttons post requests inbound: "Reset store"
    // sends `reset`; "Force double-submit" sends `submit` twice ~10ms apart.
    // The submit branch clicks the step-4 button in this same document, so the
    // `isPending` guard collapses the two clicks into one POST.
    const onMessage = (event: MessageEvent) => {
      if (
        !event.data ||
        typeof event.data !== 'object' ||
        event.data.source !== 'wizard-control'
      ) {
        return;
      }
      if (event.data.action === 'reset') {
        store.getState().reset();
      }
      if (event.data.action === 'submit') {
        (
          document.querySelector(
            '[data-testid="wizard-submit"]',
          ) as HTMLButtonElement | null
        )?.click();
      }
    };
    window.addEventListener('message', onMessage);

    return () => {
      unsubscribe();
      window.removeEventListener('message', onMessage);
    };
  }, [store]);
};
