// Cache-tag helpers. Plain string builders so a tag is never hand-typed at a
// call site and the write seam and any future read can agree on the same key by
// construction. The in-memory app has no real Server Component cache backing
// these rows, but `updateTag(invoiceCommentsTag(id))` is the correct call and
// keeps the two-system-invalidation lesson honest.

export const invoiceTag = (id: string): string => `invoice:${id}`;

export const orgInvoicesTag = (orgId: string): string =>
  `org-invoices:${orgId}`;

export const invoiceCommentsTag = (invoiceId: string): string =>
  `invoice-comments:${invoiceId}`;
