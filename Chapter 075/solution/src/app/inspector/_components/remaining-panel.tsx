import type { RemainingRow } from '@/app/inspector/inspector-reads';
import { Card } from '@/components/ui/card';

// The "Remaining tokens" panel: one bounded region whose rows are the five limiter
// keys (signin ip+email, signup ip, reset ip+email). Each row shows prefix, key, and
// remaining/limit + a reset countdown. Reads come from getRemaining (consumes no
// budget). In scaffold state the limiters are inert stubs, so `remaining` is null and
// the row reads `n/a`. The five rows are descendants of the panel, never siblings of
// it (single-slot invariant).
export const RemainingPanel = ({ rows }: { rows: RemainingRow[] }) => (
  <Card data-testid="remaining-panel" className="gap-0 p-0">
    <div className="border-b px-4 py-3 text-sm font-semibold">
      Remaining tokens
    </div>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="px-4 py-2 font-medium">prefix</th>
          <th className="px-4 py-2 font-medium">key</th>
          <th className="px-4 py-2 font-medium">remaining</th>
          <th className="px-4 py-2 font-medium">reset</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.testid} data-testid={row.testid} className="border-t">
            <td className="px-4 py-2 font-mono text-xs">{row.prefix}</td>
            <td className="px-4 py-2 font-mono text-xs">{row.key}</td>
            <td className="px-4 py-2 font-mono text-xs">
              {row.remaining === null ? 'n/a' : `${row.remaining}/${row.limit}`}
            </td>
            <td className="px-4 py-2 font-mono text-xs">
              {row.resetSeconds === null ? '—' : `${row.resetSeconds}s`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Card>
);
