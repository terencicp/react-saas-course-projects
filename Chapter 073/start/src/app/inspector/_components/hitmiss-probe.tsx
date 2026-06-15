import type { Route } from 'next';
import Link from 'next/link';

// The hit/miss probe. The framework does not surface hit/miss to user code, so the
// faithful signal is the `<FetchedAtStrip />`'s `list-fetched-at`: open /invoices,
// reload promptly (within the `minutes` revalidate window), and a STABLE string =
// cache hit, an advancing string = miss. This panel points at that flow.
export const HitMissProbe = () => (
  <section data-testid="hitmiss-probe" className="space-y-2 text-sm">
    <h2 className="font-medium">Hit / miss probe</h2>
    <p className="text-xs text-muted-foreground">
      Open the list, then reload it promptly. A stable{' '}
      <span className="font-mono">list-fetched-at</span> across reloads is a
      cache hit; an advancing one is a miss. (Past the profile's revalidate
      window the entry recomputes on its own.)
    </p>
    <Link
      className="text-sm underline"
      href={'/invoices' as Route}
      target="_blank"
    >
      Open /invoices in a new tab
    </Link>
  </section>
);
