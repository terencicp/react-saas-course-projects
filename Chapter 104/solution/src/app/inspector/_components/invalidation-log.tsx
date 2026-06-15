import type { CacheInvalidationEntry } from '@/server/store';

// The invalidation-log tail (last 20, newest first). Each row keys on its `seq`
// (the guaranteed-unique counter), never the array index — same-millisecond
// pushes can collide on `firedAt`, and an index key trips Biome's noArrayIndexKey.
// `action`-sourced rows come from the lifecycle actions; `job`-sourced rows from
// the recompute job — the contrast is the read-your-writes-vs-eventual signal.
export const InvalidationLog = ({
  entries,
}: {
  entries: CacheInvalidationEntry[];
}) => (
  <section className="space-y-2">
    <h2 className="font-medium">Invalidation log (last 20)</h2>
    <ul data-testid="invalidation-log" className="space-y-1 text-sm">
      {entries.length === 0 ? (
        <li className="text-muted-foreground">No invalidations yet.</li>
      ) : (
        entries.map((entry) => (
          <li
            key={entry.seq}
            data-testid="invalidation-row"
            className="flex justify-between gap-4 font-mono text-xs"
          >
            <span>{entry.tag || '(empty tag)'}</span>
            <span className="text-muted-foreground">{entry.source}</span>
          </li>
        ))
      )}
    </ul>
  </section>
);
