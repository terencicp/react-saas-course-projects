// The single source of truth for tag strings. Read sites (cached reads) and write
// sites (actions, the recompute job) import these helpers — a raw `org:`/`invoice:`
// literal anywhere else is a regression. Each is a pure function of its arguments.
// Tag strings are lowercase, colon-delimited, scope first.
export const invoiceTags = {
  list: (orgId: string): string => `org:${orgId}:invoices`,
  record: (orgId: string, id: string): string => `org:${orgId}:invoice:${id}`,
  summary: (orgId: string): string => `org:${orgId}:summary`,
};
