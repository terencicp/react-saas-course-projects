import type { Formats } from 'next-intl';

// TODO(L2) — dateTime/number(compact); TODO(L3) — number.currency (no
// relativeTime key — not in next-intl's Formats type)
//
// Shared formatter presets, referenced by name at `format.dateTime`/`format.number`
// call sites so a UI-wide change is one edit.
export const formats = {} as const satisfies Formats;
