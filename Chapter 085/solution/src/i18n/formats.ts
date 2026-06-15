import type { Formats } from 'next-intl';

// Shared formatter presets, referenced by name at `format.dateTime`/`format.number`
// call sites so a UI-wide change is one edit. S2 adds `number.currency`
// (narrow-symbol). There is NO `relativeTime` key — next-intl's `Formats` type has
// no slot for it (only dateTime/number/list/displayName), so adding one fails `tsc`.
export const formats = {
  dateTime: {
    short: { dateStyle: 'medium' },
    withTime: { dateStyle: 'medium', timeStyle: 'short' },
  },
  number: {
    compact: { notation: 'compact' },
    // The narrow-symbol display lives here so a UI-wide currency tweak is one
    // edit; the `currency` code stays at the call site because it is data on the
    // invoice row, not a presentation choice. No `relativeTime` key — next-intl's
    // `Formats` type has only dateTime/number/list/displayName.
    currency: { style: 'currency', currencyDisplay: 'narrowSymbol' },
  },
} as const satisfies Formats;
