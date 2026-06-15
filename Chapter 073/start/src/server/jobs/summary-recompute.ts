import 'server-only';

// The in-process summary-recompute "background job". In the DB-backed framing this
// is a Trigger.dev `schemaTask` with a Zod payload schema and its own queue —
// named, not built (the chapter-062 line has no Trigger.dev). The only concept it
// carries is `revalidateTag` from a non-action context, where `updateTag` would
// throw. The inspector's "Run summary task" button invokes it directly. The
// cross-process shared cache backend (Vercel + Upstash) is the chapter-074
// forward reference, named not built.

// TODO(L4) — Zod-validate orgId; recompute count+sum over active rows; upsert summary; revalidateTag(summary,'max'); log 'job'
export const recomputeOrgSummary = async (_input: {
  orgId: string;
}): Promise<{ orgId: string; totalCount: number; totalAmount: number }> => {
  throw new Error('summary job not implemented');
};
