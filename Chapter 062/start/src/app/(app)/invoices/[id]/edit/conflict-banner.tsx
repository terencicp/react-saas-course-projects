'use client';

import type { Invoice } from '@/server/types';

// TODO(L5) — show current values + Use latest / admin Overwrite.
//
// The honest-409 surface: the server returns the row it holds now as `current`,
// so the stale tab can recover without a refetch. Render the current values,
// a "Use latest" control that pulls them into the form (and resets the hidden
// version), and an "Overwrite anyway" control that renders ONLY for an admin
// (`canOverwrite`) — the gate is enforced again at the action. Returns null for
// now.
export const ConflictBanner = (_props: {
  current: Invoice;
  onUseLatest: () => void;
  onOverwrite: () => void;
  canOverwrite: boolean;
}) => null;
