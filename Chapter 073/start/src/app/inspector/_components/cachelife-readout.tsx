import { cacheProfiles } from '@/lib/cache/profiles';

// Reads the chosen `cacheLife` profile per cached function from
// `profiles.ts`. Renders one row per function; empty until S1 populates the map
// (the inspector readout then shows minutes / minutes / hours).
const FUNCTIONS = [
  'listInvoices',
  'getInvoiceDetail',
  'getOrgInvoiceSummary',
] as const;

export const CacheLifeReadout = () => (
  <section className="space-y-2">
    <h2 className="font-medium">cacheLife profiles</h2>
    <ul data-testid="cachelife-readout" className="space-y-1 text-sm">
      {FUNCTIONS.map((name) => {
        const profile = cacheProfiles[name]?.profile ?? '—';
        return (
          <li
            key={name}
            data-testid={`cachelife-row-${name}`}
            className="flex justify-between gap-4 font-mono text-xs"
          >
            <span>{name}</span>
            <span className="text-muted-foreground">{profile}</span>
          </li>
        );
      })}
    </ul>
  </section>
);
