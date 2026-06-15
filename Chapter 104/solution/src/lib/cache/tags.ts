// The single source of truth for tag strings. Read sites (cached reads) and write
// sites (actions, the recompute job) import these helpers — a raw `org:`/`invoice:`
// literal anywhere else is a regression. Each is a pure function of its arguments.
// Tag strings are lowercase, colon-delimited, scope first.
export const invoiceTags = {
  list: (orgId: string): string => `org:${orgId}:invoices`,
  record: (orgId: string, id: string): string => `org:${orgId}:invoice:${id}`,
  summary: (orgId: string): string => `org:${orgId}:summary`,
};

// The plan-entitlement read's cache tag — the tag the ADR's Decision and
// Consequences name. Every mutation that touches plan or entitlement state must
// invalidate it via `updateTag(orgPlanEntitlementTag(orgId))`.
export const orgPlanEntitlementTag = (orgId: string): string =>
  `org:${orgId}:plan-entitlement`;
