// TODO(L2) — commentKeys factory
//
// The real factory derives `lists`/`detail` from `all` so every key shares the
// `['comments', ...]` prefix:
//   lists: (invoiceId) => [...commentKeys.all, 'list', invoiceId] as const
//   detail: (id) => [...commentKeys.all, 'detail', id] as const
// This stub typechecks but returns the wrong (collapsed) shape the lesson fixes.
export const commentKeys = {
  all: ['comments'] as const,
  lists: (_invoiceId: string) => ['comments'] as const,
  detail: (_id: string) => ['comments'] as const,
};
