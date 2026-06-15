// Mirrors the `cacheLife` profile chosen for each cached read, so the inspector's
// readout can show it without parsing the query bodies. Keyed by cached-function
// name to match the directive trio in queries.ts.
// TODO(L2) — map listInvoices/getInvoiceDetail → 'minutes', getOrgInvoiceSummary → 'hours'
export const cacheProfiles: Record<string, { profile: string }> = {};
