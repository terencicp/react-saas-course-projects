import 'server-only';

import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { logCacheInvalidation } from '@/lib/cache/log';
import { invoiceTags } from '@/lib/cache/tags';
import { scopedInvoices } from '@/lib/invoices/scoped-query';
import { upsertSummaryRow } from '@/server/store';

// The in-process summary-recompute "background job". In the DB-backed framing this
// is a Trigger.dev `schemaTask` with a Zod payload schema and its own queue —
// named, not built (the chapter-062 line has no Trigger.dev). The only concept it
// carries is `revalidateTag` from a non-action context, where `updateTag` would
// throw. The inspector's "Run summary task" button invokes it directly. The
// cross-process shared cache backend (Vercel + Upstash) is the chapter-074
// forward reference, named not built.

// The payload schema is the boundary contract — exactly the Zod-validated
// `schemaTask` payload the DB-backed outline names. A malformed `orgId` is a parse
// error, not a silent wrong-org recompute.
const inputSchema = z.strictObject({ orgId: z.string().min(1) });

export const recomputeOrgSummary = async (input: {
  orgId: string;
}): Promise<{ orgId: string; totalCount: number; totalAmount: number }> => {
  const { orgId } = inputSchema.parse(input);

  // Recompute count + sum(total) over the active (non-archived, non-deleted)
  // rows for this org, then upsert the aggregate row.
  const active = scopedInvoices(orgId).active().take(Number.MAX_SAFE_INTEGER);
  const totalCount = active.length;
  const totalAmount = active.reduce((sum, inv) => sum + Number(inv.total), 0);
  upsertSummaryRow({
    orgId,
    totalCount,
    totalAmount,
    updatedAt: new Date().toISOString(),
  });

  // `revalidateTag` (not `updateTag`) because no user is waiting — the eventual,
  // stale-while-revalidate primitive is correct here. The required `'max'` profile
  // arg is the second argument (the single-arg form is deprecated). `updateTag`
  // would throw in this non-Server-Action context — the force-throw button
  // demonstrates that. The tag string comes only through the `tags.ts` helper.
  const summaryTag = invoiceTags.summary(orgId);
  revalidateTag(summaryTag, 'max');
  // Log AFTER the real invalidation returns so a throwing call never leaves a
  // log row claiming success; `'job'` distinguishes it from the `action` rows.
  logCacheInvalidation(summaryTag, 'job');

  return { orgId, totalCount, totalAmount };
};
