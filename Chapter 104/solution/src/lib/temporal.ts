// The single Temporal seam. This is the ONLY file that imports the polyfill — a
// move to Node's native Temporal is a one-line change here.
//
// Line 1 is the side-effect import: it installs `globalThis.Temporal` at runtime
// AND declares the ambient `Temporal` type namespace. Without it, using
// `Temporal.Instant` / `Temporal.PlainDate` as type annotations fails with
// `TS2503 Cannot find namespace 'Temporal'`, and `globalThis.Temporal` is a
// `TS7017` (no index signature) error.
import 'temporal-polyfill/global';

import { Temporal as TemporalPolyfill } from 'temporal-polyfill';

// Prefer the runtime global if a native Temporal exists; otherwise the polyfill.
export const Temporal = globalThis.Temporal ?? TemporalPolyfill;

// Parse an ISO 8601 instant string (e.g. `2026-07-01T18:00:00Z`) into an
// `Instant` — used by the seed to build DST-aware `createdAt` moments.
export const instantFromString = (s: string): Temporal.Instant =>
  Temporal.Instant.from(s);

// Parse an ISO 8601 calendar-day string (e.g. `2026-07-31`) into a `PlainDate` —
// used by the seed for zone-independent `dueDate` calendar days.
export const plainDateFromString = (s: string): Temporal.PlainDate =>
  Temporal.PlainDate.from(s);
