// A Server Component (no client hooks) that renders one labeled row per provided
// timestamp. Each cached read returns a `fetchedAt` ISO string computed once
// inside its cached body; this strip surfaces it as the only cache-state window —
// stable across refreshes = hit, advancing = miss/invalidated. The raw ISO string
// lives in a <time> so a check can read stable text.
type FetchedAtStripProps = {
  listFetchedAt?: string;
  summaryFetchedAt?: string;
  detailFetchedAt?: string;
};

const ROWS = [
  { key: 'listFetchedAt', testid: 'list-fetched-at', label: 'List' },
  { key: 'summaryFetchedAt', testid: 'summary-fetched-at', label: 'Summary' },
  { key: 'detailFetchedAt', testid: 'detail-fetched-at', label: 'Detail' },
] as const;

export const FetchedAtStrip = (props: FetchedAtStripProps) => (
  <div
    data-testid="fetched-at-strip"
    className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs"
  >
    {ROWS.map(({ key, testid, label }) => {
      const value = props[key];
      if (!value) {
        return null;
      }
      return (
        <div
          key={key}
          data-testid={testid}
          className="flex items-baseline gap-2"
        >
          <span className="font-medium text-muted-foreground">
            {label} fetched at
          </span>
          <time dateTime={value} className="font-mono tabular-nums">
            {value}
          </time>
        </div>
      );
    })}
  </div>
);
