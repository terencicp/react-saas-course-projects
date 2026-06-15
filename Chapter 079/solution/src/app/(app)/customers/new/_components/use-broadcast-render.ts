'use client';

import { useEffect } from 'react';

// The re-render-counter bridge hook. Each per-field component (and the footer)
// calls `useBroadcastRender('<field>')`; this posts `{ source: 'wizard-render',
// field }` to the parent window on EVERY render so the inspector's
// re-render-counter panel can count how often each field re-renders. The
// `useEffect` deliberately omits a dependency array so it fires on every commit
// (not just mount) — that is the whole point of counting renders.
//
// Guarded by the same `window.parent === window` early-return the snapshot hook
// uses: when the wizard is loaded directly (not inside the inspector iframe) the
// hook is a no-op, so it never posts to itself.
//
// Provided in full so the student never writes `postMessage`, consistent with
// `use-broadcast-snapshot.ts`.

const MESSAGE_SOURCE = 'wizard-render';

export const useBroadcastRender = (field: string): void => {
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) {
      return;
    }
    window.parent.postMessage({ source: MESSAGE_SOURCE, field }, '*');
  });
};
