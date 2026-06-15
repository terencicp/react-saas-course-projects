import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

type AuditRow = {
  id: string;
  action: string;
  createdAt: Date;
};

type AuditTailProps = {
  rows: AuditRow[];
};

// The compliance surface: the org's audit_logs tail, newest first. Every entitlement
// transition co-transacts an audit row; the seed writes one baseline row so the tail
// is non-empty at first paint.
export const AuditTail = ({ rows }: AuditTailProps) => (
  <Card data-testid="audit-tail" className="p-4">
    <h2 className="text-sm font-semibold">Audit log</h2>
    <Separator className="my-3" />
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">No audit events yet.</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} data-testid="audit-row" className="text-sm">
            {row.action}
          </li>
        ))}
      </ul>
    )}
  </Card>
);
