// The single source of truth for tag strings. Read sites (cached reads) and write
// sites (actions, the recompute job) import these helpers — a raw `org:`/`invoice:`
// literal anywhere else is a regression. Each is a pure function of its arguments.
// Tag strings are lowercase, colon-delimited, scope first.
// TODO(L2) — invoiceTags.list/record/summary returning org:${orgId}:invoices, :invoice:${id}, :summary
export const invoiceTags = {
  list: (_orgId: string): string => '',
  record: (_orgId: string, _id: string): string => '',
  summary: (_orgId: string): string => '',
};
