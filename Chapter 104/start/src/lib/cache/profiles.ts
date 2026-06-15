// Mirrors the `cacheLife` profile chosen for each cached read, so the inspector's
// readout can show it without parsing the query bodies. Keyed by cached-function
// name to match the directive trio in queries.ts.
export const cacheProfiles: Record<string, { profile: string }> = {
  listInvoices: { profile: 'minutes' },
  getInvoiceDetail: { profile: 'minutes' },
  getOrgInvoiceSummary: { profile: 'hours' },
};
